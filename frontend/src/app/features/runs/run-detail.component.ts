import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RunsService } from './runs.service';
import { AuthService } from '../../core/auth.service';
import { RUN_STATUS, type RunDetail } from './run.models';

@Component({
  selector: 'app-run-detail',
  imports: [RouterLink, FormsModule],
  templateUrl: './run-detail.component.html',
})
export class RunDetailComponent implements OnDestroy {
  private readonly api = inject(RunsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  private poll: ReturnType<typeof setInterval> | null = null;

  readonly run = signal<RunDetail | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly statusLabel = RUN_STATUS;
  readonly isOwner = computed(() => this.run()?.created_by === this.auth.user()?.id);
  selectedFile: File | null = null;

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
      // Keep polling while the run is New or In-progress.
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  async upload(): Promise<void> {
    if (!this.selectedFile) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.uploadFile(this.id, this.selectedFile);
      this.selectedFile = null;
      await this.load();
    } catch {
      this.error.set('Upload failed');
    } finally {
      this.busy.set(false);
    }
  }

  async removeFile(fileId: number): Promise<void> {
    try {
      await this.api.removeFile(fileId);
      await this.load();
    } catch {
      this.error.set('Failed to remove file');
    }
  }

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

  async togglePublish(isPublished: boolean): Promise<void> {
    try {
      await this.api.update(this.id, { is_published: isPublished });
      await this.load();
    } catch {
      this.error.set('Failed to update');
    }
  }

  async deleteRun(): Promise<void> {
    if (!confirm('Delete this run?')) return;
    try {
      await this.api.remove(this.id);
      await this.router.navigateByUrl('/runs');
    } catch {
      this.error.set('Failed to delete run');
    }
  }
}
