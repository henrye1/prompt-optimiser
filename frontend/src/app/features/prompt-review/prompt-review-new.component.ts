import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PromptReviewService } from './prompt-review.service';
import { PromptSetsService } from '../promptsets/promptsets.service';
import { ModelsService } from '../models/models.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { PromptSetSummary } from '../promptsets/promptset.models';
import type { AiModel } from '../models/model.models';

/** New prompt review session (/prompt-review/new): load a set (or blank) and pick a model. */
@Component({
  selector: 'app-prompt-review-new',
  imports: [FormsModule, RouterLink, LoaderComponent],
  templateUrl: './prompt-review-new.component.html',
})
export class PromptReviewNewComponent {
  private readonly api = inject(PromptReviewService);
  private readonly promptSetsApi = inject(PromptSetsService);
  private readonly modelsApi = inject(ModelsService);
  private readonly router = inject(Router);

  readonly sets = signal<PromptSetSummary[]>([]);
  readonly models = signal<AiModel[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);

  name = '';
  readonly setSearch = signal('');
  /** null = blank document. */
  readonly selectedSetId = signal<number | null>(null);
  readonly selectedModelId = signal<number | null>(null);

  readonly filteredSets = computed(() => {
    const q = this.setSearch().toLowerCase().trim();
    return q ? this.sets().filter((s) => s.name.toLowerCase().includes(q)) : this.sets();
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [sets, models] = await Promise.all([this.promptSetsApi.list(), this.modelsApi.list()]);
      this.sets.set(sets);
      this.models.set(models);
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
    return this.name.trim() !== '';
  }

  async create(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const session = await this.api.create({
        name: this.name.trim(),
        source_prompt_set_id: this.selectedSetId() ?? undefined,
        ai_model_id: this.selectedModelId() ?? undefined,
      });
      await this.router.navigate(['/prompt-review', session.id]);
    } catch {
      this.error.set('Failed to create session');
      this.saving.set(false);
    }
  }
}
