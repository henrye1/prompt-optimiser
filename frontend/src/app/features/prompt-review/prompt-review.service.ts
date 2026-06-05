import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  DocChange,
  PromptReviewPrompt,
  PromptReviewSection,
  PromptReviewSession,
  PromptReviewSessionCard,
  RestructureProposal,
  ReviewResult,
} from './prompt-review.models';

/** Wraps the backend Prompt Review API. */
@Injectable({ providedIn: 'root' })
export class PromptReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  list() {
    return firstValueFrom(this.http.get<PromptReviewSessionCard[]>(`${this.base}/prompt-review-sessions`));
  }
  get(id: number) {
    return firstValueFrom(this.http.get<PromptReviewSession>(`${this.base}/prompt-review-sessions/${id}`));
  }
  create(input: { name: string; source_prompt_set_id?: number; ai_model_id?: number }) {
    return firstValueFrom(this.http.post<PromptReviewSession>(`${this.base}/prompt-review-sessions`, input));
  }
  update(id: number, patch: { name?: string; is_published?: boolean }) {
    return firstValueFrom(this.http.patch<unknown>(`${this.base}/prompt-review-sessions/${id}`, patch));
  }
  remove(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompt-review-sessions/${id}`));
  }

  // ---- document ----
  addPrompt(sessionId: number) {
    return firstValueFrom(this.http.post<PromptReviewPrompt>(`${this.base}/prompt-review-sessions/${sessionId}/prompts`, {}));
  }
  updatePrompt(promptId: number, patch: { name?: string; prompt_type_id?: number }) {
    return firstValueFrom(this.http.patch<unknown>(`${this.base}/prompt-review-prompts/${promptId}`, patch));
  }
  deletePrompt(promptId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompt-review-prompts/${promptId}`));
  }
  addSection(promptId: number) {
    return firstValueFrom(this.http.post<PromptReviewSection>(`${this.base}/prompt-review-prompts/${promptId}/sections`, {}));
  }
  updateSection(sectionId: number, patch: { title?: string; content?: string }) {
    return firstValueFrom(this.http.patch<PromptReviewSection>(`${this.base}/prompt-review-sections/${sectionId}`, patch));
  }
  deleteSection(sectionId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/prompt-review-sections/${sectionId}`));
  }

  // ---- AI tools ----
  review(sessionId: number) {
    return firstValueFrom(this.http.post<ReviewResult>(`${this.base}/prompt-review-sessions/${sessionId}/review`, {}));
  }
  improveSection(sectionId: number, goal: string) {
    return firstValueFrom(
      this.http.post<{ suggestion: string }>(`${this.base}/prompt-review-sections/${sectionId}/improve`, { goal }),
    );
  }
  improveDoc(sessionId: number, goal: string) {
    return firstValueFrom(
      this.http.post<{ items: DocChange[] }>(`${this.base}/prompt-review-sessions/${sessionId}/improve`, { goal }),
    );
  }
  restructurePreview(sessionId: number) {
    return firstValueFrom(this.http.get<RestructureProposal>(`${this.base}/prompt-review-sessions/${sessionId}/restructure`));
  }
  restructureApply(sessionId: number) {
    return firstValueFrom(this.http.post<PromptReviewSession>(`${this.base}/prompt-review-sessions/${sessionId}/restructure`, {}));
  }
  publish(sessionId: number, input: { name: string; description?: string; is_published?: boolean }) {
    return firstValueFrom(
      this.http.post<{ prompt_set_id: number }>(`${this.base}/prompt-review-sessions/${sessionId}/publish`, input),
    );
  }
}
