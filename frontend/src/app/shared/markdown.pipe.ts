import { Pipe, type PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Renders markdown (e.g. LLM section output) to HTML. Bind the result with
 * `[innerHTML]`, which Angular sanitizes, so the output is XSS-safe.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return marked.parse(value, { async: false, gfm: true, breaks: true });
  }
}
