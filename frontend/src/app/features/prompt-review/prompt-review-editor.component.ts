import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PromptReviewService } from './prompt-review.service';
import { PromptSetsService } from '../promptsets/promptsets.service';
import { AuthService } from '../../core/auth.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { PromptType } from '../promptsets/promptset.models';
import type {
  DocChange,
  Finding,
  PromptReviewPrompt,
  PromptReviewSection,
  PromptReviewSession,
  RestructureProposal,
  Severity,
} from './prompt-review.models';

interface DiffSegment {
  t: 'eq' | 'ins' | 'del';
  v: string;
}

/** Word-level diff (LCS) for showing what the AI changed. */
function wordDiff(a: string, b: string): DiffSegment[] {
  const aw = (a || '').split(/(\s+)/);
  const bw = (b || '').split(/(\s+)/);
  const n = aw.length;
  const m = bw.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffSegment[] = [];
  const push = (t: DiffSegment['t'], v: string): void => {
    const l = out[out.length - 1];
    if (l && l.t === t) l.v += v;
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

interface Preset {
  label: string;
  goal: string;
}
const PRESETS: Preset[] = [
  { label: 'Make it specific', goal: 'make it specific and unambiguous' },
  { label: 'Require grounding', goal: 'require grounding in the source documents and cite the figures' },
  { label: 'Add output format', goal: 'specify a clear output format — conclusion first, then figures' },
  { label: 'Tidy & tighten', goal: 'tidy and tighten the wording without changing the meaning' },
];

/** Prompt Review editor: the document, AI review/improve/restructure, and publish. */
@Component({
  selector: 'app-prompt-review-editor',
  imports: [FormsModule, RouterLink, LoaderComponent],
  templateUrl: './prompt-review-editor.component.html',
})
export class PromptReviewEditorComponent {
  private readonly api = inject(PromptReviewService);
  private readonly setsApi = inject(PromptSetsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  readonly session = signal<PromptReviewSession | null>(null);
  readonly prompts = signal<PromptReviewPrompt[]>([]);
  readonly promptTypes = signal<PromptType[]>([]);
  readonly error = signal<string | null>(null);
  readonly selSecId = signal<number | null>(null);

  // review state
  readonly reviewed = signal(false);
  readonly reviewing = signal(false);
  readonly findings = signal<Finding[]>([]);
  readonly secFilter = signal<number | null>(null);
  readonly sevFilter = signal<'all' | Severity>('all');

  // per-section AI
  readonly aiSecId = signal<number | null>(null);
  readonly aiGoal = signal('');
  readonly aiBusy = signal(false);
  readonly aiResult = signal<string | null>(null);

  // modals
  readonly modal = signal<'improve' | 'restructure' | 'publish' | null>(null);
  // improve modal
  readonly impGoal = signal('');
  readonly impBusy = signal(false);
  readonly impItems = signal<DocChange[] | null>(null);
  readonly impDone = signal<ReadonlySet<number>>(new Set());
  // restructure modal
  readonly restructure = signal<RestructureProposal | null>(null);
  readonly restructureBusy = signal(false);
  // publish modal
  publishName = '';
  publishDesc = '';
  readonly publishVis = signal<'draft' | 'published'>('draft');
  readonly publishBusy = signal(false);
  readonly publishedSetId = signal<number | null>(null);

  readonly presets = PRESETS;
  private dirty = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isOwner = computed(() => this.session()?.created_by === this.auth.user()?.id);

  readonly sevCounts = computed(() => {
    const f = this.findings();
    return {
      high: f.filter((x) => x.severity === 'high').length,
      med: f.filter((x) => x.severity === 'med').length,
      low: f.filter((x) => x.severity === 'low').length,
    };
  });
  readonly shownFindings = computed(() => {
    let f = this.findings();
    const sec = this.secFilter();
    if (sec) f = f.filter((x) => x.sectionId === sec);
    const sev = this.sevFilter();
    if (sev !== 'all') f = f.filter((x) => x.severity === sev);
    return f;
  });
  readonly health = computed(() => {
    const w = { high: 14, med: 7, low: 3 };
    let score = 100;
    this.findings().forEach((x) => (score -= w[x.severity] || 0));
    score = Math.max(0, Math.min(100, score));
    const band = score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work';
    return { score, band };
  });
  readonly promptCount = computed(() => this.prompts().length);
  readonly sectionCount = computed(() => this.prompts().reduce((n, p) => n + p.sections.length, 0));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [types, session] = await Promise.all([this.setsApi.promptTypes(), this.api.get(this.id)]);
      this.promptTypes.set(types);
      this.session.set(session);
      this.prompts.set(session.prompts);
      const first = session.prompts[0]?.sections[0];
      if (first) this.selSecId.set(first.id);
    } catch {
      this.error.set('Failed to load session');
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
  sevLabel(s: Severity): string {
    return s === 'high' ? 'High' : s === 'med' ? 'Medium' : 'Low';
  }
  findingsForSec(id: number): Finding[] {
    return this.findings().filter((f) => f.sectionId === id);
  }
  worstForSec(id: number): Severity | null {
    if (!this.reviewed()) return null;
    const f = this.findingsForSec(id);
    return f.some((x) => x.severity === 'high') ? 'high' : f.some((x) => x.severity === 'med') ? 'med' : f.length ? 'low' : null;
  }
  groupRuns(p: PromptReviewPrompt): number {
    return p.sections.reduce((n, s) => n + this.findingsForSec(s.id).length, 0);
  }
  healthTone(score: number): string {
    return score >= 85 ? 'strong' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'weak';
  }
  // ring geometry (r=26)
  readonly ringCirc = 2 * Math.PI * 26;
  ringOffset(score: number): number {
    return this.ringCirc * (1 - score / 100);
  }

  scrollToSec(id: number): void {
    const el = document.getElementById('sec-' + id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
  scrollToAssist(): void {
    const el = document.getElementById('pg-assist');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  }

  // ---- local doc mutation helpers ----
  private mutate(fn: (prompts: PromptReviewPrompt[]) => PromptReviewPrompt[]): void {
    this.prompts.update((ps) => fn(ps.map((p) => ({ ...p, sections: [...p.sections] }))));
  }

  selectSection(id: number, scroll = true): void {
    this.selSecId.set(id);
    if (this.aiSecId() !== id) this.closeAi();
    if (scroll) this.scrollToSec(id);
  }

  // ---- editing (debounced persistence) ----
  onSectionField(sectionId: number, patch: Partial<PromptReviewSection>): void {
    this.mutate((ps) => ps.map((p) => ({ ...p, sections: p.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) })));
    this.dirty.add(sectionId);
    this.scheduleFlush();
  }
  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 600);
  }
  private async flush(): Promise<void> {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    const ids = [...this.dirty];
    this.dirty.clear();
    for (const id of ids) {
      const sec = this.findSection(id);
      if (sec) {
        try { await this.api.updateSection(id, { title: sec.title, content: sec.content }); } catch { this.error.set('Failed to save edit'); }
      }
    }
  }
  private findSection(id: number): PromptReviewSection | null {
    for (const p of this.prompts()) for (const s of p.sections) if (s.id === id) return s;
    return null;
  }

  async renamePrompt(promptId: number, name: string): Promise<void> {
    this.mutate((ps) => ps.map((p) => (p.id === promptId ? { ...p, name } : p)));
    try { await this.api.updatePrompt(promptId, { name }); } catch { this.error.set('Failed to rename prompt'); }
  }
  async setPromptType(promptId: number, prompt_type_id: number): Promise<void> {
    const desc = this.promptTypes().find((t) => t.id === prompt_type_id)?.description ?? '';
    this.mutate((ps) => ps.map((p) => (p.id === promptId ? { ...p, prompt_type_id, prompt_type: { description: desc } } : p)));
    try { await this.api.updatePrompt(promptId, { prompt_type_id }); } catch { this.error.set('Failed to change type'); }
  }
  async addPrompt(): Promise<void> {
    try {
      const prompt = await this.api.addPrompt(this.id);
      this.prompts.update((ps) => [...ps, prompt]);
      if (prompt.sections[0]) this.selectSection(prompt.sections[0].id, false);
    } catch { this.error.set('Failed to add prompt'); }
  }
  async deletePrompt(promptId: number): Promise<void> {
    if (!window.confirm('Delete this prompt and its sections?')) return;
    try {
      await this.api.deletePrompt(promptId);
      this.prompts.update((ps) => ps.filter((p) => p.id !== promptId));
    } catch { this.error.set('Failed to delete prompt'); }
  }
  async addSection(promptId: number): Promise<void> {
    try {
      const section = await this.api.addSection(promptId);
      this.mutate((ps) => ps.map((p) => (p.id === promptId ? { ...p, sections: [...p.sections, section] } : p)));
      this.selectSection(section.id, false);
    } catch { this.error.set('Failed to add section'); }
  }
  async deleteSection(sectionId: number): Promise<void> {
    try {
      await this.api.deleteSection(sectionId);
      this.mutate((ps) => ps.map((p) => ({ ...p, sections: p.sections.filter((s) => s.id !== sectionId) })));
    } catch { this.error.set('Failed to delete section'); }
  }

  // ---- review ----
  async review(): Promise<void> {
    if (this.reviewing()) return;
    this.reviewing.set(true);
    this.error.set(null);
    try {
      await this.flush();
      const { findings } = await this.api.review(this.id);
      this.findings.set(findings);
      this.reviewed.set(true);
      this.secFilter.set(null);
      this.sevFilter.set('all');
      setTimeout(() => this.scrollToAssist(), 60);
    } catch {
      this.error.set("Couldn't review the document just now. Please try again.");
    } finally {
      this.reviewing.set(false);
    }
  }

  jumpTo(f: Finding): void {
    if (f.sectionId) this.selectSection(f.sectionId);
  }
  filterToSection(id: number): void {
    this.secFilter.set(id);
    this.sevFilter.set('all');
    this.scrollToAssist();
  }
  async applyFix(f: Finding): Promise<void> {
    if (f.fix === '__restructure__') { void this.openRestructure(); return; }
    if (f.fix && f.sectionId) {
      this.onSectionField(f.sectionId, { content: f.fix });
      await this.flush();
      this.findings.update((list) => list.filter((x) => x.id !== f.id));
    }
  }

  // ---- per-section AI improve ----
  openImprove(sectionId: number): void {
    this.selectSection(sectionId, false);
    this.aiSecId.set(sectionId);
    this.aiGoal.set('');
    this.aiBusy.set(false);
    this.aiResult.set(null);
  }
  closeAi(): void {
    this.aiSecId.set(null);
    this.aiGoal.set('');
    this.aiBusy.set(false);
    this.aiResult.set(null);
  }
  async generateAi(goalArg?: string): Promise<void> {
    const id = this.aiSecId();
    const goal = (goalArg ?? this.aiGoal()).trim();
    if (id === null || !goal || this.aiBusy()) return;
    this.aiGoal.set(goal);
    this.aiBusy.set(true);
    this.aiResult.set(null);
    try {
      await this.flush();
      const { suggestion } = await this.api.improveSection(id, goal);
      this.aiResult.set(suggestion);
    } catch {
      this.error.set("Couldn't reach the model just now. Please try again.");
      this.closeAi();
    } finally {
      this.aiBusy.set(false);
    }
  }
  runPreset(p: Preset): void {
    void this.generateAi(p.goal);
  }
  aiDiffSegments(): DiffSegment[] {
    const id = this.aiSecId();
    const sec = id ? this.findSection(id) : null;
    return this.aiResult() === null ? [] : wordDiff(sec?.content ?? '', this.aiResult() ?? '');
  }
  applyAi(): void {
    const id = this.aiSecId();
    const result = this.aiResult();
    if (id === null || result === null) return;
    this.onSectionField(id, { content: result });
    this.findings.update((list) => list.filter((x) => x.sectionId !== id));
    this.closeAi();
  }

  // ---- improve-document modal ----
  openImproveDoc(): void {
    this.modal.set('improve');
    this.impGoal.set('');
    this.impBusy.set(false);
    this.impItems.set(null);
    this.impDone.set(new Set());
  }
  async runImproveDoc(goalArg?: string): Promise<void> {
    const goal = (goalArg ?? this.impGoal()).trim();
    if (!goal || this.impBusy()) return;
    this.impGoal.set(goal);
    this.impBusy.set(true);
    try {
      await this.flush();
      const { items } = await this.api.improveDoc(this.id, goal);
      this.impItems.set(items);
    } catch {
      this.error.set("Couldn't generate suggestions just now. Please try again.");
    } finally {
      this.impBusy.set(false);
    }
  }
  improveRemaining(): DocChange[] {
    const done = this.impDone();
    return (this.impItems() ?? []).filter((it) => !done.has(it.sectionId));
  }
  diffOf(before: string, after: string): DiffSegment[] {
    return wordDiff(before, after);
  }
  async applyChange(it: DocChange): Promise<void> {
    this.onSectionField(it.sectionId, { content: it.after });
    await this.flush();
    this.findings.update((list) => list.filter((x) => x.sectionId !== it.sectionId));
    this.impDone.update((d) => new Set(d).add(it.sectionId));
  }
  async applyAllChanges(): Promise<void> {
    for (const it of this.improveRemaining()) await this.applyChange(it);
    this.closeModal();
  }

  // ---- restructure modal ----
  async openRestructure(): Promise<void> {
    this.modal.set('restructure');
    this.restructure.set(null);
    try {
      this.restructure.set(await this.api.restructurePreview(this.id));
    } catch {
      this.error.set('Failed to compute a restructure.');
      this.closeModal();
    }
  }
  async applyRestructure(): Promise<void> {
    if (this.restructureBusy()) return;
    this.restructureBusy.set(true);
    try {
      const session = await this.api.restructureApply(this.id);
      this.session.set(session);
      this.prompts.set(session.prompts);
      this.closeModal();
    } catch {
      this.error.set('Failed to restructure.');
    } finally {
      this.restructureBusy.set(false);
    }
  }
  restructureTagClass(t: string): string {
    return t;
  }

  // ---- publish modal ----
  openPublish(): void {
    const s = this.session();
    this.publishName = `${s?.source?.name ?? s?.name ?? 'Prompt set'} (tuned)`;
    this.publishDesc = '';
    this.publishVis.set('draft');
    this.publishBusy.set(false);
    this.publishedSetId.set(null);
    this.modal.set('publish');
  }
  async doPublish(): Promise<void> {
    if (!this.publishName.trim() || this.publishBusy()) return;
    this.publishBusy.set(true);
    this.error.set(null);
    try {
      await this.flush();
      const { prompt_set_id } = await this.api.publish(this.id, {
        name: this.publishName.trim(),
        description: this.publishDesc.trim() || undefined,
        is_published: this.publishVis() === 'published',
      });
      this.publishedSetId.set(prompt_set_id);
    } catch {
      this.error.set('Failed to publish.');
    } finally {
      this.publishBusy.set(false);
    }
  }
  goToPublishedSet(): void {
    const id = this.publishedSetId();
    if (id) void this.router.navigate(['/prompt-sets', id]);
  }

  closeModal(): void {
    this.modal.set(null);
  }
}
