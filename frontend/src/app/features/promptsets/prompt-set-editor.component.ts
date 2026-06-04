import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PromptSetsService } from './promptsets.service';
import { readJsonFile } from '../../core/json-file';
import type { Prompt, PromptSetDetail, PromptType } from './promptset.models';

/** Single prompt set editor: prompts list (left) + section editor (right). */
@Component({
  selector: 'app-prompt-set-editor',
  imports: [FormsModule, RouterLink],
  templateUrl: './prompt-set-editor.component.html',
})
export class PromptSetEditorComponent {
  private readonly api = inject(PromptSetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  readonly detail = signal<PromptSetDetail | null>(null);
  readonly promptTypes = signal<PromptType[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  readonly prompts = computed(() => this.detail()?.prompts ?? []);
  readonly selectedPromptId = signal<number | null>(null);
  readonly selectedPrompt = computed<Prompt | null>(
    () => this.prompts().find((p) => p.id === this.selectedPromptId()) ?? null,
  );

  newPromptName = '';
  newPromptTypeId = signal<number | null>(null);
  newSectionTitle = '';

  readonly canAddPrompt = computed(() => this.promptTypes().length > 0);

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const [types, detail] = await Promise.all([this.api.promptTypes(), this.api.get(this.id)]);
      this.promptTypes.set(types);
      this.newPromptTypeId.set(types[0]?.id ?? null);
      this.applyDetail(detail);
    } catch {
      this.error.set('Failed to load prompt set');
    }
  }

  private applyDetail(detail: PromptSetDetail): void {
    this.detail.set(detail);
    if (!detail.prompts.some((p) => p.id === this.selectedPromptId())) {
      this.selectedPromptId.set(detail.prompts[0]?.id ?? null);
    }
  }

  private async reload(): Promise<void> {
    this.applyDetail(await this.api.get(this.id));
  }

  private async guard(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(this.errMessage(e));
    }
  }

  private errMessage(e: unknown): string {
    const body = (e as { error?: { error?: string } })?.error;
    if (body?.error) return body.error;
    return e instanceof Error ? e.message : 'Action failed';
  }

  typeName(id: number): string {
    return this.promptTypes().find((t) => t.id === id)?.description ?? '';
  }
  typeKey(id: number): string {
    return this.typeName(id).toLowerCase();
  }
  charCount(p: Prompt): number {
    return p.sections.reduce((n, s) => n + s.content.length, 0);
  }
  tokens(chars: number): number {
    return Math.max(1, Math.round(chars / 4));
  }

  // --- set ---
  renameSet(name: string): Promise<void> {
    return this.guard(() => this.api.update(this.id, { name }));
  }
  saveDescription(description: string): Promise<void> {
    return this.guard(async () => {
      await this.api.update(this.id, { description });
      const d = this.detail();
      if (d) this.detail.set({ ...d, description });
    });
  }
  togglePublish(isPublished: boolean): Promise<void> {
    return this.guard(async () => {
      await this.api.update(this.id, { is_published: isPublished });
      const d = this.detail();
      if (d) this.detail.set({ ...d, is_published: isPublished });
    });
  }
  deleteSet(): Promise<void> {
    return this.guard(async () => {
      if (!confirm('Delete this prompt set?')) return;
      await this.api.remove(this.id);
      await this.router.navigateByUrl('/prompt-sets');
    });
  }

  // --- prompts ---
  selectPrompt(id: number): void {
    this.selectedPromptId.set(id);
  }
  addPrompt(): Promise<void> {
    const name = this.newPromptName.trim();
    const typeId = this.newPromptTypeId();
    if (!name || typeId === null) return Promise.resolve();
    return this.guard(async () => {
      const created = await this.api.addPrompt(this.id, { name, prompt_type_id: typeId });
      this.newPromptName = '';
      await this.reload();
      this.selectedPromptId.set(created.id);
    });
  }
  deletePrompt(p: Prompt): Promise<void> {
    return this.guard(async () => {
      if (!confirm(`Delete prompt "${p.name}"?`)) return;
      await this.api.removePrompt(p.id);
      await this.reload();
    });
  }
  movePrompt(index: number, dir: -1 | 1): Promise<void> {
    return this.swap(this.prompts(), index, dir, (id, sequence) =>
      this.api.updatePrompt(id, { sequence }),
    );
  }
  async importPromptFromJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.guard(async () => this.applyDetail(await this.api.importPrompt(this.id, await readJsonFile(file))));
    input.value = '';
  }

  // --- sections ---
  addSection(): Promise<void> {
    const p = this.selectedPrompt();
    const title = this.newSectionTitle.trim();
    if (!p || !title) return Promise.resolve();
    return this.guard(async () => {
      await this.api.addSection(p.id, { title });
      this.newSectionTitle = '';
      await this.reload();
    });
  }
  deleteSection(sectionId: number): Promise<void> {
    return this.guard(async () => {
      await this.api.removeSection(sectionId);
      await this.reload();
    });
  }
  moveSection(index: number, dir: -1 | 1): Promise<void> {
    const p = this.selectedPrompt();
    if (!p) return Promise.resolve();
    return this.swap(p.sections, index, dir, (id, sequence) =>
      this.api.updateSection(id, { sequence }),
    );
  }
  async importSectionsFromJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const p = this.selectedPrompt();
    if (!file || !p) return;
    await this.guard(async () => this.applyDetail(await this.api.importSections(p.id, await readJsonFile(file))));
    input.value = '';
  }

  savePrompt(): Promise<void> {
    const p = this.selectedPrompt();
    if (!p) return Promise.resolve();
    this.saving.set(true);
    return this.guard(async () => {
      await this.api.updatePrompt(p.id, { name: p.name, prompt_type_id: p.prompt_type_id });
      await Promise.all(
        p.sections.map((s) => this.api.updateSection(s.id, { title: s.title, content: s.content })),
      );
      await this.reload();
    }).finally(() => this.saving.set(false));
  }

  private swap<T extends { id: number; sequence: number }>(
    items: T[],
    index: number,
    dir: -1 | 1,
    update: (id: number, sequence: number) => Promise<unknown>,
  ): Promise<void> {
    const other = index + dir;
    if (other < 0 || other >= items.length) return Promise.resolve();
    const a = items[index];
    const b = items[other];
    return this.guard(async () => {
      await Promise.all([update(a.id, b.sequence), update(b.id, a.sequence)]);
      await this.reload();
    });
  }
}
