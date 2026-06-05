import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PromptReviewService } from './prompt-review.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { PromptReviewSessionCard } from './prompt-review.models';

/** Prompt Review landing page: a grid of editing sessions. */
@Component({
  selector: 'app-prompt-review-list',
  imports: [RouterLink, LoaderComponent],
  templateUrl: './prompt-review-list.component.html',
})
export class PromptReviewListComponent {
  private readonly api = inject(PromptReviewService);

  readonly sessions = signal<PromptReviewSessionCard[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.sessions.set(await this.api.list());
    } catch {
      this.error.set('Failed to load sessions');
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
  relTime(iso: string): string {
    const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
}
