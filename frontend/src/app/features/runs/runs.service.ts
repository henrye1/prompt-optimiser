import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { RunDetail, RunFile, RunSummary } from './run.models';

/** Wraps the backend Runs API. */
@Injectable({ providedIn: 'root' })
export class RunsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api`;

  list() {
    return firstValueFrom(this.http.get<RunSummary[]>(`${this.base}/runs`));
  }

  get(id: number) {
    return firstValueFrom(this.http.get<RunDetail>(`${this.base}/runs/${id}`));
  }

  create(input: { name: string; description?: string; prompt_set_id: number }) {
    return firstValueFrom(this.http.post<RunDetail>(`${this.base}/runs`, input));
  }

  update(id: number, patch: { name?: string; description?: string; is_published?: boolean }) {
    return firstValueFrom(this.http.patch<RunSummary>(`${this.base}/runs/${id}`, patch));
  }

  remove(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/runs/${id}`));
  }

  uploadFile(runId: number, file: File, runFileTypeId = 1, isExample = false) {
    const form = new FormData();
    form.append('file', file);
    form.append('run_file_type_id', String(runFileTypeId));
    form.append('is_example_file', String(isExample));
    return firstValueFrom(this.http.post<RunFile>(`${this.base}/runs/${runId}/files`, form));
  }

  removeFile(fileId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/files/${fileId}`));
  }

  execute(runId: number) {
    return firstValueFrom(
      this.http.post<{ status: string }>(`${this.base}/runs/${runId}/execute`, {}),
    );
  }
}
