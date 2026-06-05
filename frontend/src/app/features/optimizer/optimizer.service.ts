import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  OptimizerSession,
  OptimizerSessionCard,
  OptimizerSectionRun,
  OptimizerFile,
} from './optimizer.models';

/** Wraps the backend Optimizer API. */
@Injectable({ providedIn: 'root' })
export class OptimizerService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  list() {
    return firstValueFrom(this.http.get<OptimizerSessionCard[]>(`${this.base}/optimizer-sessions`));
  }

  get(id: number) {
    return firstValueFrom(this.http.get<OptimizerSession>(`${this.base}/optimizer-sessions/${id}`));
  }

  create(input: { name: string; prompt_set_id: number; ai_model_id?: number }) {
    return firstValueFrom(this.http.post<OptimizerSession>(`${this.base}/optimizer-sessions`, input));
  }

  update(id: number, patch: { name?: string; is_published?: boolean }) {
    return firstValueFrom(this.http.patch<unknown>(`${this.base}/optimizer-sessions/${id}`, patch));
  }

  remove(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/optimizer-sessions/${id}`));
  }

  uploadFile(sessionId: number, file: File, runFileTypeId = 1) {
    const form = new FormData();
    form.append('file', file);
    form.append('run_file_type_id', String(runFileTypeId));
    return firstValueFrom(this.http.post<OptimizerFile>(`${this.base}/optimizer-sessions/${sessionId}/files`, form));
  }

  removeFile(fileId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/optimizer-files/${fileId}`));
  }

  updateSection(sectionId: number, currentContent: string) {
    return firstValueFrom(
      this.http.patch<{ id: number; current_content: string }>(`${this.base}/optimizer-sections/${sectionId}`, {
        current_content: currentContent,
      }),
    );
  }

  runSection(sectionId: number) {
    return firstValueFrom(
      this.http.post<OptimizerSectionRun>(`${this.base}/optimizer-sections/${sectionId}/run`, {}),
    );
  }

  /** Runs the section's ORIGINAL prompt as a cached baseline for comparison. */
  runBaseline(sectionId: number) {
    return firstValueFrom(
      this.http.post<OptimizerSectionRun>(`${this.base}/optimizer-sections/${sectionId}/run-baseline`, {}),
    );
  }

  /** Ask the session's model to rewrite a section's prompt for a stated goal. */
  improveSection(sectionId: number, goal: string) {
    return firstValueFrom(
      this.http.post<{ suggestion: string }>(`${this.base}/optimizer-sections/${sectionId}/improve`, { goal }),
    );
  }

  saveToSet(sessionId: number) {
    return firstValueFrom(
      this.http.post<{ prompt_set_id: number; version: number }>(
        `${this.base}/optimizer-sessions/${sessionId}/save-to-set`,
        {},
      ),
    );
  }
}
