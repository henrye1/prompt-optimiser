import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PromptSetsService } from './promptsets.service';
import { readJsonFile } from '../../core/json-file';
import type { PromptSetSummary } from './promptset.models';

type StatusFilter = 'all' | 'published' | 'drafts';

/** Prompt Sets landing — rich cards that open the single-set editor. */
@Component({
  selector: 'app-prompt-set-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './prompt-set-list.component.html',
})
export class PromptSetListComponent {
  private readonly api = inject(PromptSetsService);
  private readonly router = inject(Router);
  private readonly dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

  readonly sets = signal<PromptSetSummary[]>([]);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly status = signal<StatusFilter>('all');

  readonly allCount = computed(() => this.sets().length);
  readonly publishedCount = computed(() => this.sets().filter((s) => s.is_published).length);
  readonly draftCount = computed(() => this.sets().filter((s) => !s.is_published).length);

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const status = this.status();
    return this.sets()
      .filter((s) =>
        status === 'all' ? true : status === 'published' ? s.is_published : !s.is_published,
      )
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true));
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      this.sets.set(await this.api.list());
    } catch {
      this.error.set('Failed to load prompt sets');
    }
  }

  /** The set-creation form lands later; for now create a draft and open the editor. */
  async createNew(): Promise<void> {
    try {
      const created = await this.api.create('Untitled prompt set');
      await this.router.navigate(['/prompt-sets', created.id]);
    } catch {
      this.error.set('Failed to create prompt set');
    }
  }

  async importFromJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const created = await this.api.importSet(await readJsonFile(file));
      await this.router.navigate(['/prompt-sets', created.id]);
    } catch (e) {
      const body = (e as { error?: { error?: string } })?.error;
      this.error.set(body?.error ?? 'Import failed');
    } finally {
      input.value = '';
    }
  }

  formatDate(iso: string): string {
    return this.dateFmt.format(new Date(iso));
  }
}
