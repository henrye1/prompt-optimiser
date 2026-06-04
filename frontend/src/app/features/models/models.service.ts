import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AiModel, AiModelProvider } from './model.models';

/** Wraps the backend AI models API. */
@Injectable({ providedIn: 'root' })
export class ModelsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  list() {
    return firstValueFrom(this.http.get<AiModel[]>(`${this.base}/models`));
  }

  providers() {
    return firstValueFrom(
      this.http.get<AiModelProvider[]>(`${this.base}/reference/ai-model-providers`),
    );
  }

  create(input: { name: string; ai_model_provider_id: number; api_key: string }) {
    return firstValueFrom(this.http.post<AiModel>(`${this.base}/models`, input));
  }

  remove(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/models/${id}`));
  }
}
