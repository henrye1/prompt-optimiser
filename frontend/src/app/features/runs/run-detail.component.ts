import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { AuthService } from '../../core/auth.service';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { RUN_STATUS, type RunDetail, type RunSection } from './run.models';

@Component({
  selector: 'app-run-detail',
  imports: [RouterLink, MarkdownPipe],
  templateUrl: './run-detail.component.html',
})
export class RunDetailComponent implements OnDestroy {
  private readonly api = inject(RunsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  private poll: ReturnType<typeof setInterval> | null = null;
  private readonly dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  private readonly timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  readonly run = signal<RunDetail | null>(null);
  readonly error = signal<string | null>(null);
  readonly statusLabel = RUN_STATUS;
  readonly isOwner = computed(() => this.run()?.created_by === this.auth.user()?.id);

  readonly sectionsComplete = computed(
    () => this.run()?.sections.filter((s) => s.run_section_status_id === 4).length ?? 0,
  );
  readonly runningSection = computed(
    () => this.run()?.sections.find((s) => s.run_section_status_id === 2)?.title ?? null,
  );

  pct(): number {
    const total = this.run()?.sections.length ?? 0;
    return total ? Math.round((this.sectionsComplete() / total) * 100) : 0;
  }

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private async load(): Promise<void> {
    try {
      const run = await this.api.get(this.id);
      this.run.set(run);
      if (run.run_status_id === 1 || run.run_status_id === 2) this.startPolling();
      else this.stopPolling();
    } catch {
      this.error.set('Failed to load run');
    }
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = setInterval(() => void this.load(), 2000);
  }
  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  // ---- display helpers ----
  sectionType(sec: RunSection): string {
    return sec.prompt_section?.prompt?.prompt_type?.description ?? '';
  }
  typeKey(desc: string): string {
    return (desc || '').toLowerCase();
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
  totalTokens(): number {
    const r = this.run();
    return r ? r.input_tokens + r.output_tokens : 0;
  }
  formatTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  }
  duration(): string {
    const r = this.run();
    if (!r?.started_at || !r?.completed_at) return '—';
    const secs = Math.max(0, Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000));
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
  formatDateTime(iso: string): string {
    const d = new Date(iso);
    return `${this.dateFmt.format(d)} · ${this.timeFmt.format(d)}`;
  }
  ownerName(): string {
    return this.isOwner() ? this.auth.user()?.email ?? 'You' : 'Team member';
  }
  ownerInitials(): string {
    return this.ownerName().trim().charAt(0).toUpperCase() || '?';
  }
  lastError(): string | null {
    const r = this.run();
    if (!r) return null;
    const failed = r.sections.find((s) => s.run_section_status_id === 3 && s.error_message);
    if (failed?.error_message) return failed.error_message;
    return [...r.logs].reverse().find((l) => l.level === 'error')?.message ?? 'The run failed.';
  }

  // ---- actions (owner only) ----
  async execute(): Promise<void> {
    this.error.set(null);
    try {
      await this.api.execute(this.id);
      this.startPolling();
      await this.load();
    } catch {
      this.error.set('Failed to start run');
    }
  }
  async togglePublish(): Promise<void> {
    const r = this.run();
    if (!r) return;
    try {
      await this.api.update(this.id, { is_published: !r.is_published });
      await this.load();
    } catch {
      this.error.set('Failed to update visibility');
    }
  }
  cancel(): void {
    this.error.set('Cancelling a running job isn’t supported yet.');
  }
  exportRun(): void {
    const r = this.run();
    if (!r) return;
    const body = r.sections
      .map((s) => `## ${s.title}\n\n${s.content || '(no output)'}`)
      .join('\n\n');
    const md = `# ${r.name}\n\n${body}\n`;
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.name.replace(/[^\w.\-]+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  copy(text: string): void {
    void navigator.clipboard?.writeText(text);
  }
  copyAll(): void {
    const r = this.run();
    if (!r) return;
    this.copy(r.sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n'));
  }
}
