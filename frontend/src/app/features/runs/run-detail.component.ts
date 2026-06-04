import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { marked } from 'marked';
import { RunsService } from './runs.service';
import { AuthService } from '../../core/auth.service';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { RUN_STATUS, type RunDetail, type RunSection } from './run.models';

export type ExportFormat = 'md' | 'pdf' | 'word';

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
  readonly exportOpen = signal(false);
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
  @HostListener('document:click')
  closeExportMenu(): void {
    this.exportOpen.set(false);
  }

  exportAs(format: ExportFormat): void {
    this.exportOpen.set(false);
    if (format === 'md') this.exportMarkdown();
    else if (format === 'pdf') this.exportPdf();
    else this.exportWord();
  }

  private exportMarkdown(): void {
    this.downloadBlob(new Blob([this.buildMarkdown()], { type: 'text/markdown' }), `${this.fileBase()}.md`);
  }

  private exportWord(): void {
    // HTML-based .doc — opens in Word / Google Docs with formatting preserved.
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      this.documentBody();
    this.downloadBlob(new Blob([html], { type: 'application/msword' }), `${this.fileBase()}.doc`);
  }

  private exportPdf(): void {
    // Print-to-PDF: open the rendered run in a new window and trigger the print dialog.
    const win = window.open('', '_blank');
    if (!win) {
      this.error.set('Pop-up blocked — allow pop-ups for this site to export PDF.');
      return;
    }
    const script = `<script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>`;
    win.document.write(`<!doctype html><html>${this.documentBody(script)}</html>`);
    win.document.close();
    win.focus();
  }

  /** Shared <head>+<body> markup for the Word and PDF exports. */
  private documentBody(extraHead = ''): string {
    const r = this.run();
    if (!r) return '';
    const css =
      "body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:800px;margin:2rem auto;padding:0 1rem;}" +
      'h1{font-size:1.7rem;}h2{font-size:1.25rem;margin-top:1.6rem;border-bottom:1px solid #e5e7eb;padding-bottom:.3rem;}h3{font-size:1.05rem;}' +
      'table{border-collapse:collapse;width:100%;margin:.6rem 0;}th,td{border:1px solid #cbd5e1;padding:.4rem .6rem;text-align:left;}th{background:#f1f5f9;}' +
      'code{background:#f1f5f9;padding:.1rem .3rem;border-radius:4px;font-family:Consolas,monospace;}' +
      'pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:.7rem;overflow:auto;}pre code{background:none;padding:0;}' +
      'blockquote{border-left:3px solid #c7d2fe;margin:0 0 .7rem;padding:.2rem .9rem;color:#475569;}';
    const sections = r.sections
      .map((s) => {
        const inner = s.content
          ? (marked.parse(s.content, { async: false, gfm: true, breaks: true }) as string)
          : '<p><em>(no output)</em></p>';
        return `<section><h2>${this.esc(s.title)}</h2>${inner}</section>`;
      })
      .join('\n');
    return (
      `<head><meta charset="utf-8"><title>${this.esc(r.name)}</title><style>${css}</style>${extraHead}</head>` +
      `<body><h1>${this.esc(r.name)}</h1>${sections}</body>`
    );
  }

  private buildMarkdown(): string {
    const r = this.run();
    if (!r) return '';
    const body = r.sections.map((s) => `## ${s.title}\n\n${s.content || '(no output)'}`).join('\n\n');
    return `# ${r.name}\n\n${body}\n`;
  }

  private fileBase(): string {
    return (this.run()?.name ?? 'run').replace(/[^\w.\-]+/g, '_');
  }

  private esc(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
