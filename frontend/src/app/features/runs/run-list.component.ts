import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { PromptSetsService } from '../promptsets/promptsets.service';
import { RUN_STATUS, type RunSummary } from './run.models';
import type { PromptSetSummary } from '../promptsets/promptset.models';

@Component({
  selector: 'app-run-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './run-list.component.html',
})
export class RunListComponent {
  private readonly api = inject(RunsService);
  private readonly promptSets = inject(PromptSetsService);
  private readonly router = inject(Router);

  readonly runs = signal<RunSummary[]>([]);
  readonly sets = signal<PromptSetSummary[]>([]);
  readonly error = signal<string | null>(null);
  readonly statusLabel = RUN_STATUS;

  newName = '';
  selectedSetId = signal<number | null>(null);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      const [runs, sets] = await Promise.all([this.api.list(), this.promptSets.list()]);
      this.runs.set(runs);
      this.sets.set(sets);
      if (this.selectedSetId() === null) this.selectedSetId.set(sets[0]?.id ?? null);
    } catch {
      this.error.set('Failed to load runs');
    }
  }

  async create(): Promise<void> {
    const name = this.newName.trim();
    const setId = this.selectedSetId();
    if (!name || setId === null) return;
    try {
      const run = await this.api.create({ name, prompt_set_id: setId });
      await this.router.navigate(['/runs', run.id]);
    } catch {
      this.error.set('Failed to create run');
    }
  }

  async remove(run: RunSummary, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`Delete run "${run.name}"?`)) return;
    try {
      await this.api.remove(run.id);
      await this.reload();
    } catch {
      this.error.set('Failed to delete run');
    }
  }
}
