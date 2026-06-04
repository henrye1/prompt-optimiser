import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { AuthService } from '../../core/auth.service';
import { LoaderComponent } from '../../shared/loader.component';
import { RUN_STATUS, type RunCard } from './run.models';

@Component({
  selector: 'app-run-list',
  imports: [FormsModule, RouterLink, LoaderComponent],
  templateUrl: './run-list.component.html',
})
export class RunListComponent {
  private readonly api = inject(RunsService);
  private readonly auth = inject(AuthService);
  private readonly dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  private readonly timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  readonly runs = signal<RunCard[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly tab = signal<'mine' | 'published'>('mine');
  readonly statusLabel = RUN_STATUS;

  private readonly uid = computed(() => this.auth.user()?.id ?? null);
  readonly myRuns = computed(() => this.runs().filter((r) => r.created_by === this.uid()));
  readonly publishedRuns = computed(() => this.runs().filter((r) => r.is_published));

  readonly filtered = computed(() => {
    const base = this.tab() === 'mine' ? this.myRuns() : this.publishedRuns();
    const q = this.search().toLowerCase().trim();
    return q
      ? base.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.prompt_set_name ?? '').toLowerCase().includes(q),
        )
      : base;
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      this.runs.set(await this.api.list());
    } catch {
      this.error.set('Failed to load runs');
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

  totalTokens(r: RunCard): number {
    return r.input_tokens + r.output_tokens;
  }
  formatTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  }
  formatDuration(start: string | null, end: string | null): string {
    if (!start || !end) return '—';
    const secs = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
  formatDateTime(iso: string): string {
    const d = new Date(iso);
    return `${this.dateFmt.format(d)} · ${this.timeFmt.format(d)}`;
  }
  progressPct(r: RunCard): number {
    return r.section_total ? Math.round((r.section_complete / r.section_total) * 100) : 0;
  }
}
