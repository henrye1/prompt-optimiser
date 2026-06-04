import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { RUN_STATUS, type RunSummary } from './run.models';

@Component({
  selector: 'app-run-list',
  imports: [RouterLink],
  templateUrl: './run-list.component.html',
})
export class RunListComponent {
  private readonly api = inject(RunsService);

  readonly runs = signal<RunSummary[]>([]);
  readonly error = signal<string | null>(null);
  readonly statusLabel = RUN_STATUS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      this.runs.set(await this.api.list());
    } catch {
      this.error.set('Failed to load runs');
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
