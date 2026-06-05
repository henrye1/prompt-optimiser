import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OptimizerService } from './optimizer.service';
import { AuthService } from '../../core/auth.service';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { LoaderComponent } from '../../shared/loader.component';
import type { OptimizerFile, OptimizerSection, OptimizerSectionRun, OptimizerSession } from './optimizer.models';

interface SectionGroup {
  seq: number;
  promptName: string;
  typeDesc: string;
  sections: OptimizerSection[];
}

interface FileGroup {
  label: string;
  files: OptimizerFile[];
}

interface DiffSegment {
  t: 'eq' | 'ins' | 'del';
  v: string;
}

/** Word-level diff (LCS) so users can see what the AI changed. */
function wordDiff(a: string, b: string): DiffSegment[] {
  const aw = (a || '').split(/(\s+)/);
  const bw = (b || '').split(/(\s+)/);
  const n = aw.length;
  const m = bw.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffSegment[] = [];
  const push = (t: DiffSegment['t'], v: string): void => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.v += v;
    else out.push({ t, v });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aw[i] === bw[j]) { push('eq', aw[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', aw[i]); i++; }
    else { push('ins', bw[j]); j++; }
  }
  while (i < n) push('del', aw[i++]);
  while (j < m) push('ins', bw[j++]);
  return out;
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
  /** prompt_sequence values whose nav group is collapsed. */
  readonly collapsed = signal<ReadonlySet<number>>(new Set());

  // AI helper (per-section; reset when the selection changes)
  readonly aiOpen = signal(false);
  readonly aiGoal = signal('');
  readonly aiBusy = signal(false);
  readonly aiSuggestion = signal<string | null>(null);
  readonly aiError = signal<string | null>(null);
  /** Word-level diff between the current prompt and the AI suggestion. */
  readonly aiDiff = computed<DiffSegment[]>(() =>
    this.aiSuggestion() === null ? [] : wordDiff(this.draft(), this.aiSuggestion() ?? ''),
  );

  readonly isOwner = computed(() => this.session()?.created_by === this.auth.user()?.id);
  readonly selected = computed(() => this.session()?.sections.find((s) => s.id === this.selectedId()) ?? null);

  // ---- "Compare to original" (baseline) ----
  /** Whether the Output card is showing the compare-to-original view. */
  readonly compare = signal(false);
  /** History runs of the edited (current) prompt — excludes baseline runs. */
  readonly currentRuns = computed<OptimizerSectionRun[]>(() => (this.selected()?.runs ?? []).filter((r) => !r.is_baseline));
  /** The latest current run (its output is the "Current" column). */
  readonly latestRun = computed<OptimizerSectionRun | null>(() => this.currentRuns()[0] ?? null);
  /** The cached baseline run (output of the original prompt). */
  readonly baselineRun = computed<OptimizerSectionRun | null>(() => (this.selected()?.runs ?? []).find((r) => r.is_baseline) ?? null);
  /** Word-level diff of the original prompt → the prompt that produced the current output. */
  readonly comparePromptDiff = computed<DiffSegment[]>(() => {
    const s = this.selected();
    const cur = this.latestRun();
    if (!s || !cur) return [];
    return wordDiff(s.original_content, cur.prompt_content);
  });
  /** True when the current output's prompt still matches the original (results should match). */
  readonly promptUnchanged = computed(() => {
    const s = this.selected();
    const cur = this.latestRun();
    return !!s && !!cur && cur.prompt_content === s.original_content;
  });

  readonly contextGroups = computed(() => this.groupsByType('System'));
  readonly assessmentGroups = computed(() => this.session() ? this.groupsExcluding('System') : []);

  /** Uploaded documents grouped by file type for the sidebar. */
  readonly fileGroups = computed<FileGroup[]>(() => {
    const files = this.session()?.files ?? [];
    const defs = [
      { type: 1, label: 'Financial statements' },
      { type: 2, label: 'Rating report' },
      { type: 3, label: 'Credit paper examples' },
    ];
    const groups = defs
      .map((d) => ({ label: d.label, files: files.filter((f) => f.run_file_type_id === d.type) }))
      .filter((g) => g.files.length);
    const known = new Set([1, 2, 3]);
    const other = files.filter((f) => !known.has(f.run_file_type_id));
    if (other.length) groups.push({ label: 'Other documents', files: other });
    return groups;
  });

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
        map.set(s.prompt_sequence, { seq: s.prompt_sequence, promptName: s.prompt_name, typeDesc: s.prompt_type?.description ?? '', sections: [] });
      }
      map.get(s.prompt_sequence)!.sections.push(s);
    }
    return [...map.values()];
  }

  // ---- collapsible nav groups ----
  isCollapsed(seq: number): boolean {
    return this.collapsed().has(seq);
  }
  toggleGroup(seq: number): void {
    const next = new Set(this.collapsed());
    next.has(seq) ? next.delete(seq) : next.add(seq);
    this.collapsed.set(next);
  }
  private expandGroup(seq: number): void {
    if (!this.collapsed().has(seq)) return;
    const next = new Set(this.collapsed());
    next.delete(seq);
    this.collapsed.set(next);
  }
  groupRuns(g: SectionGroup): number {
    return g.sections.reduce((n, s) => n + s.runs.length, 0);
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
    this.expandGroup(section.prompt_sequence);
    if (section.id === this.selectedId()) return;
    await this.persistDraft();
    this.selectedId.set(section.id);
    this.draft.set(section.current_content);
    this.info.set(null);
    this.compare.set(false);
    this.resetAi();
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

  /**
   * Toggles the compare-to-original view. The first time it's switched on for a
   * section, the ORIGINAL prompt is run once (and cached as a baseline run);
   * reused on later toggles.
   */
  async toggleCompare(): Promise<void> {
    const sec = this.selected();
    if (!sec) return;
    if (this.compare()) {
      this.compare.set(false);
      return;
    }
    if (!this.baselineRun() && !this.busy()) {
      this.busy.set(true);
      this.error.set(null);
      try {
        await this.api.runBaseline(sec.id);
        this.session.set(await this.api.get(this.id));
      } catch {
        this.error.set('Failed to run the original prompt');
        this.busy.set(false);
        return;
      }
      this.busy.set(false);
    }
    this.compare.set(true);
  }

  // ---- AI helper ----
  openAi(): void {
    this.aiOpen.set(true);
  }
  resetAi(): void {
    this.aiOpen.set(false);
    this.aiGoal.set('');
    this.aiBusy.set(false);
    this.aiSuggestion.set(null);
    this.aiError.set(null);
  }
  tryAgain(): void {
    this.aiSuggestion.set(null);
    this.aiError.set(null);
  }
  async generateSuggestion(): Promise<void> {
    const sec = this.selected();
    const goal = this.aiGoal().trim();
    if (!sec || !goal || this.aiBusy()) return;
    this.aiBusy.set(true);
    this.aiError.set(null);
    this.aiSuggestion.set(null);
    try {
      // Persist any pending edits so the model improves the prompt as shown.
      await this.persistDraft();
      const { suggestion } = await this.api.improveSection(sec.id, goal);
      this.aiSuggestion.set(suggestion);
    } catch {
      this.aiError.set("Couldn't reach the model just now. Please try again.");
    } finally {
      this.aiBusy.set(false);
    }
  }
  async applySuggestion(alsoRun: boolean): Promise<void> {
    const suggestion = this.aiSuggestion();
    const sec = this.selected();
    if (suggestion === null || !sec) return;
    this.draft.set(suggestion);
    this.dirty.set(suggestion !== sec.current_content);
    this.resetAi();
    if (alsoRun && !this.isSystem(sec)) {
      await this.rerun();
    } else {
      this.info.set('AI suggestion applied — rerun to regenerate.');
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

  // ---- file display helpers ----
  private isSpreadsheet(f: OptimizerFile): boolean {
    return /\.(xlsx?|csv)$/i.test(f.file_name) || (f.mime_type ?? '').includes('sheet') || (f.mime_type ?? '').includes('csv');
  }
  /** Which glyph to draw for a file row: trophy (rating), columns (spreadsheet), or doc. */
  fileGlyph(f: OptimizerFile): 'trophy' | 'columns' | 'doc' {
    if (f.run_file_type_id === 2) return 'trophy';
    return this.isSpreadsheet(f) ? 'columns' : 'doc';
  }
  /** Colour class for the file glyph. */
  fileKind(f: OptimizerFile): 'rating' | 'xls' | 'pdf' {
    if (f.run_file_type_id === 2) return 'rating';
    return this.isSpreadsheet(f) ? 'xls' : 'pdf';
  }
  fileExt(f: OptimizerFile): string {
    const ext = f.file_name.includes('.') ? f.file_name.split('.').pop() : '';
    return (ext || 'file').toUpperCase();
  }
}
