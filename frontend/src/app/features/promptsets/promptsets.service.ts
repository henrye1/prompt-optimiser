import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  Prompt,
  PromptSection,
  PromptSetBase,
  PromptSetDetail,
  PromptSetSummary,
  PromptType,
} from './promptset.models';

/** Wraps the backend PromptSet/editor API. All calls are auth-attached by the interceptor. */
@Injectable({ providedIn: 'root' })
export class PromptSetsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  promptTypes() {
    return firstValueFrom(this.http.get<PromptType[]>(`${this.base}/reference/prompt-types`));
  }

  list() {
    return firstValueFrom(this.http.get<PromptSetSummary[]>(`${this.base}/prompt-sets`));
  }

  get(id: number) {
    return firstValueFrom(this.http.get<PromptSetDetail>(`${this.base}/prompt-sets/${id}`));
  }

  create(name: string) {
    return firstValueFrom(this.http.post<PromptSetBase>(`${this.base}/prompt-sets`, { name }));
  }

  update(id: number, patch: { name?: string; description?: string; is_published?: boolean }) {
    return firstValueFrom(
      this.http.patch<PromptSetBase>(`${this.base}/prompt-sets/${id}`, patch),
    );
  }

  remove(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompt-sets/${id}`));
  }

  addPrompt(setId: number, input: { name: string; prompt_type_id: number }) {
    return firstValueFrom(
      this.http.post<Prompt>(`${this.base}/prompt-sets/${setId}/prompts`, input),
    );
  }

  updatePrompt(id: number, patch: Partial<Pick<Prompt, 'name' | 'prompt_type_id' | 'sequence'>>) {
    return firstValueFrom(this.http.patch<Prompt>(`${this.base}/prompts/${id}`, patch));
  }

  removePrompt(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompts/${id}`));
  }

  addSection(promptId: number, input: { title: string; content?: string }) {
    return firstValueFrom(
      this.http.post<PromptSection>(`${this.base}/prompts/${promptId}/sections`, input),
    );
  }

  updateSection(
    id: number,
    patch: Partial<Pick<PromptSection, 'title' | 'content' | 'sequence'>>,
  ) {
    return firstValueFrom(
      this.http.patch<PromptSection>(`${this.base}/prompt-sections/${id}`, patch),
    );
  }

  removeSection(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompt-sections/${id}`));
  }

  // ---- JSON import ----
  importSet(payload: unknown) {
    return firstValueFrom(
      this.http.post<PromptSetDetail>(`${this.base}/prompt-sets/import`, payload),
    );
  }

  importPrompt(setId: number, payload: unknown) {
    return firstValueFrom(
      this.http.post<PromptSetDetail>(`${this.base}/prompt-sets/${setId}/prompts/import`, payload),
    );
  }

  importSections(promptId: number, payload: unknown) {
    return firstValueFrom(
      this.http.post<PromptSetDetail>(`${this.base}/prompts/${promptId}/sections/import`, payload),
    );
  }
}
