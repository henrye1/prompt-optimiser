import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ModelsService } from './models.service';
import { LoaderComponent } from '../../shared/loader.component';
import type { AiModelProvider } from './model.models';

/** Standalone "Add a model" page (/models/new). */
@Component({
  selector: 'app-model-add',
  imports: [FormsModule, RouterLink, LoaderComponent],
  templateUrl: './model-add.component.html',
})
export class ModelAddComponent {
  private readonly api = inject(ModelsService);
  private readonly router = inject(Router);

  readonly providers = signal<AiModelProvider[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly showKey = signal(false);

  name = '';
  providerId = signal<number | null>(null);
  apiKey = '';

  /** Method (not computed) so it tracks the plain ngModel fields on every change. */
  canSave(): boolean {
    return this.name.trim() !== '' && this.providerId() !== null && this.apiKey.trim() !== '';
  }

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const providers = await this.api.providers();
      this.providers.set(providers);
      this.providerId.set(providers[0]?.id ?? null);
    } catch {
      this.error.set('Failed to load providers');
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

  keyHint(name: string): string {
    const key = this.providerKey(name);
    if (key === 'google') return 'AIza…';
    if (key === 'anthropic') return 'sk-ant-…';
    return '';
  }

  /** Example exact model id for the selected provider — the name is used verbatim as the API model id. */
  modelIdExample(): string {
    const provider = this.providers().find((p) => p.id === this.providerId());
    const key = this.providerKey(provider?.name);
    if (key === 'google') return 'gemini-2.5-flash';
    if (key === 'anthropic') return 'claude-opus-4-6';
    return 'model-id';
  }

  async save(): Promise<void> {
    const providerId = this.providerId();
    if (!this.canSave() || providerId === null) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.create({
        name: this.name.trim(),
        ai_model_provider_id: providerId,
        api_key: this.apiKey.trim(),
      });
      await this.router.navigateByUrl('/models');
    } catch {
      this.error.set('Failed to add model');
    } finally {
      this.saving.set(false);
    }
  }
}
