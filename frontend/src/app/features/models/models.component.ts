import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModelsService } from './models.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { AiModel } from './model.models';

/** Models list page. The add-model form lives on its own /models/new route. */
@Component({
  selector: 'app-models',
  imports: [RouterLink, LoaderComponent],
  templateUrl: './models.component.html',
})
export class ModelsComponent {
  private readonly api = inject(ModelsService);
  private readonly dateFmt = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD

  readonly models = signal<AiModel[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      this.models.set(await this.api.list());
    } catch {
      this.error.set('Failed to load models');
    } finally {
      this.loading.set(false);
    }
  }

  /** google | anthropic | other — used for tile/dot colour. */
  providerKey(name: string | undefined | null): string {
    const n = (name ?? '').toLowerCase();
    if (n.includes('google')) return 'google';
    if (n.includes('anthropic')) return 'anthropic';
    return 'other';
  }

  initial(name: string | undefined | null): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?';
  }

  formatDate(iso: string): string {
    return this.dateFmt.format(new Date(iso));
  }

  async remove(model: AiModel): Promise<void> {
    if (!confirm(`Remove "${model.name}"?`)) return;
    try {
      await this.api.remove(model.id);
      await this.reload();
    } catch {
      this.error.set('Failed to remove model');
    }
  }
}
