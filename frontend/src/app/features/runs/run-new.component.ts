import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { PromptSetsService } from '../promptsets/promptsets.service';
import { ModelsService } from '../models/models.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { PromptSetSummary } from '../promptsets/promptset.models';
import type { AiModel } from '../models/model.models';

interface FileType {
  id: number;
  description: string;
}

/** New run form (/runs/new): name + prompt set + model + categorised file uploads. */
@Component({
  selector: 'app-run-new',
  imports: [FormsModule, RouterLink, LoaderComponent],
  templateUrl: './run-new.component.html',
})
export class RunNewComponent {
  private readonly runsApi = inject(RunsService);
  private readonly promptSetsApi = inject(PromptSetsService);
  private readonly modelsApi = inject(ModelsService);
  private readonly router = inject(Router);

  readonly sets = signal<PromptSetSummary[]>([]);
  readonly models = signal<AiModel[]>([]);
  readonly fileTypes = signal<FileType[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);

  name = '';
  readonly setSearch = signal('');
  readonly selectedSetId = signal<number | null>(null);
  readonly selectedModelId = signal<number | null>(null);
  readonly enabledTypes = signal<Set<number>>(new Set());
  readonly filesByType = signal<Record<number, File[]>>({});

  readonly filteredSets = computed(() => {
    const q = this.setSearch().toLowerCase().trim();
    return q ? this.sets().filter((s) => s.name.toLowerCase().includes(q)) : this.sets();
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [sets, models, fileTypes] = await Promise.all([
        this.promptSetsApi.list(),
        this.modelsApi.list(),
        this.runsApi.fileTypes(),
      ]);
      this.sets.set(sets);
      this.models.set(models);
      this.fileTypes.set(fileTypes);
    } catch {
      this.error.set('Failed to load prompt sets and models');
    } finally {
      this.loading.set(false);
    }
  }

  providerKey(name: string | undefined | null): string {
    const n = (name ?? '').toLowerCase();
    if (n.includes('google')) return 'google';
    if (n.includes('anthropic')) return 'anthropic';
    return 'other';
  }
  initial(name: string | undefined | null): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?';
  }

  canSave(): boolean {
    return this.name.trim() !== '' && this.selectedSetId() !== null && this.selectedModelId() !== null;
  }

  // ---- files ----
  isTypeEnabled(id: number): boolean {
    return this.enabledTypes().has(id);
  }
  toggleType(id: number): void {
    this.enabledTypes.update((s) => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
        this.filesByType.update((m) => ({ ...m, [id]: [] }));
      } else {
        next.add(id);
      }
      return next;
    });
  }
  filesFor(id: number): File[] {
    return this.filesByType()[id] ?? [];
  }
  onFiles(event: Event, typeId: number): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    if (picked.length) {
      this.filesByType.update((m) => ({ ...m, [typeId]: [...(m[typeId] ?? []), ...picked] }));
    }
    input.value = '';
  }
  removeFile(typeId: number, index: number): void {
    this.filesByType.update((m) => {
      const arr = [...(m[typeId] ?? [])];
      arr.splice(index, 1);
      return { ...m, [typeId]: arr };
    });
  }

  async save(execute: boolean): Promise<void> {
    const setId = this.selectedSetId();
    const modelId = this.selectedModelId();
    if (!this.canSave() || setId === null || modelId === null) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const run = await this.runsApi.create({
        name: this.name.trim(),
        prompt_set_id: setId,
        ai_model_id: modelId,
      });
      const byType = this.filesByType();
      for (const ft of this.fileTypes()) {
        if (!this.enabledTypes().has(ft.id)) continue;
        for (const file of byType[ft.id] ?? []) {
          await this.runsApi.uploadFile(run.id, file, ft.id);
        }
      }
      if (execute) await this.runsApi.execute(run.id);
      await this.router.navigate(['/runs', run.id]);
    } catch {
      this.error.set('Failed to create run');
      this.saving.set(false);
    }
  }
}
