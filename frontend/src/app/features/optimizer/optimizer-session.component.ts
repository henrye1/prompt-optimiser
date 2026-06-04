import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OptimizerService } from './optimizer.service';
import { AuthService } from '../../core/auth.service';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { LoaderComponent } from '../../shared/loader.component';
import type { OptimizerSection, OptimizerSession } from './optimizer.models';

interface SectionGroup {
  promptName: string;
  typeDesc: string;
  sections: OptimizerSection[];
}

/** Optimizer session workspace: tune a section's prompt, rerun, and save as a new set version. */
@Component({
  selector: 'app-optimizer-session',
  imports: [FormsModule, RouterLink, MarkdownPipe, LoaderComponent],
  templateUrl: './optimizer-session.component.html',
})
export class OptimizerSessionComponent {
  private readonly api = inject(OptimizerService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  private readonly dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  private readonly timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  readonly session = signal<OptimizerSession | null>(null);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly selectedId = signal<number | null>(null);
  readonly draft = signal('');
  private readonly dirty = signal(false);

  readonly isOwner = computed(() => this.session()?.created_by === this.auth.user()?.id);
  readonly selected = computed(() => this.session()?.sections.find((s) => s.id === this.selectedId()) ?? null);

  readonly contextGroups = computed(() => this.groupsByType('System'));
  readonly assessmentGroups = computed(() => this.session() ? this.groupsExcluding('System') : []);

  constructor() {
    void this.load();
  }

  private groupsByType(typeDesc: string): SectionGroup[] {
    return this.buildGroups((s) => s.prompt_type?.description === typeDesc);
  }
  private groupsExcluding(typeDesc: string): SectionGroup[] {
    return this.buildGroups((s) => s.prompt_type?.description !== typeDesc);
  }
  private buildGroups(keep: (s: OptimizerSection) => boolean): SectionGroup[] {
    const secs = (this.session()?.sections ?? []).filter(keep);
    const map = new Map<number, SectionGroup>();
    for (const s of secs) {
      if (!map.has(s.prompt_sequence)) {
        map.set(s.prompt_sequence, { promptName: s.prompt_name, typeDesc: s.prompt_type?.description ?? '', sections: [] });
      }
      map.get(s.prompt_sequence)!.sections.push(s);
    }
    return [...map.values()];
  }

  private async load(): Promise<void> {
    try {
      const session = await this.api.get(this.id);
      this.session.set(session);
      // Default to the first runnable (non-System) section, else the first section.
      const first = session.sections.find((s) => s.prompt_type?.description !== 'System') ?? session.sections[0];
      if (first && this.selectedId() === null) {
        this.selectedId.set(first.id);
        this.draft.set(first.current_content);
      }
    } catch {
      this.error.set('Failed to load session');
    }
  }

  // ---- selection / editing ----
  async select(section: OptimizerSection): Promise<void> {
    if (section.id === this.selectedId()) return;
    await this.persistDraft();
    this.selectedId.set(section.id);
    this.draft.set(section.current_content);
    this.info.set(null);
  }
  onDraftChange(v: string): void {
    this.draft.set(v);
    this.dirty.set(v !== (this.selected()?.current_content ?? ''));
  }
  isSystem(s: OptimizerSection | null): boolean {
    return s?.prompt_type?.description === 'System';
  }

  private async persistDraft(): Promise<void> {
    const sec = this.selected();
    if (!sec || !this.dirty()) return;
    try {
      await this.api.updateSection(sec.id, this.draft());
      sec.current_content = this.draft();
      this.dirty.set(false);
    } catch {
      this.error.set('Failed to save prompt edit');
    }
  }

  // ---- actions ----
  async rerun(): Promise<void> {
    const sec = this.selected();
    if (!sec || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.persistDraft();
      await this.api.runSection(sec.id);
      const fresh = await this.api.get(this.id);
      this.session.set(fresh);
      const updated = fresh.sections.find((s) => s.id === sec.id);
      if (updated) this.draft.set(updated.current_content);
    } catch {
      this.error.set('Failed to run section');
    } finally {
      this.busy.set(false);
    }
  }

  restore(promptContent: string): void {
    this.draft.set(promptContent);
    this.dirty.set(promptContent !== (this.selected()?.current_content ?? ''));
    this.info.set('Prompt restored — rerun to regenerate.');
  }

  async saveToSet(): Promise<void> {
    if (this.saving()) return;
    const ok = window.confirm(
      'Save these tuned prompts as a NEW VERSION of the prompt set?\n\n' +
        'This creates a new version and does not change the original set or any existing runs.',
    );
    if (!ok) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.persistDraft();
      const result = await this.api.saveToSet(this.id);
      this.info.set(`Saved as version ${result.version}.`);
      await this.router.navigate(['/prompt-sets', result.prompt_set_id]);
    } catch {
      this.error.set('Failed to save to prompt set');
    } finally {
      this.saving.set(false);
    }
  }

  // ---- display helpers ----
  providerKey(name: string | undefined | null): string {
    const n = (name ?? '').toLowerCase();
    if (n.includes('google')) return 'google';
    if (n.includes('anthropic')) return 'anthropic';
    return 'other';
  }
  initial(name: string | undefined | null): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?';
  }
  typeKey(desc: string | undefined | null): string {
    return (desc ?? '').toLowerCase();
  }
  formatTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  }
  latency(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  }
  formatDateTime(iso: string): string {
    const d = new Date(iso);
    return `${this.dateFmt.format(d)} · ${this.timeFmt.format(d)}`;
  }
  financialCount(): number {
    return this.session()?.files.filter((f) => f.run_file_type_id === 1).length ?? 0;
  }
  ratingCount(): number {
    return this.session()?.files.filter((f) => f.run_file_type_id === 2).length ?? 0;
  }
}
