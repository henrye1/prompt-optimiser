import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelsService } from './models.service';
import type { AiModel, AiModelProvider } from './model.models';

/** Models page: connect Google / Anthropic models with per-user API keys. */
@Component({
  selector: 'app-models',
  imports: [FormsModule],
  templateUrl: './models.component.html',
})
export class ModelsComponent {
  private readonly api = inject(ModelsService);
  private readonly dateFmt = new Intl.DateTimeFormat('en-CA'); // YYYY-MM-DD

  readonly models = signal<AiModel[]>([]);
  readonly providers = signal<AiModelProvider[]>([]);
  readonly error = signal<string | null>(null);

  // Add-model modal state.
  readonly showAdd = signal(false);
  readonly saving = signal(false);
  newName = '';
  newProviderId = signal<number | null>(null);
  newApiKey = '';

  readonly canSave = computed(
    () => this.newName.trim() !== '' && this.newProviderId() !== null && this.newApiKey.trim() !== '',
  );

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.error.set(null);
    try {
      const [models, providers] = await Promise.all([this.api.list(), this.api.providers()]);
      this.models.set(models);
      this.providers.set(providers);
      if (this.newProviderId() === null) this.newProviderId.set(providers[0]?.id ?? null);
    } catch {
      this.error.set('Failed to load models');
    }
  }

  /** google | anthropic | other — used for tile/dot colour. */
  providerKey(name: string | undefined | null): string {
    const n = (name ?? '').toLowerCase();
    if (n.includes('google')) return 'google';
    if (n.includes('anthropic')) return 'anthropic';
    return 'other';
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  formatDate(iso: string): string {
    return this.dateFmt.format(new Date(iso));
  }

  openAdd(): void {
    this.error.set(null);
    this.newName = '';
    this.newApiKey = '';
    this.newProviderId.set(this.providers()[0]?.id ?? null);
    this.showAdd.set(true);
  }

  closeAdd(): void {
    this.showAdd.set(false);
  }

  async addModel(): Promise<void> {
    const providerId = this.newProviderId();
    if (!this.canSave() || providerId === null) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.create({
        name: this.newName.trim(),
        ai_model_provider_id: providerId,
        api_key: this.newApiKey.trim(),
      });
      this.showAdd.set(false);
      await this.reload();
    } catch {
      this.error.set('Failed to add model');
    } finally {
      this.saving.set(false);
    }
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
