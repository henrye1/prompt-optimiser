import type { SupabaseClient } from '@supabase/supabase-js';
import { convertToMarkdown } from '../../lib/markdown.js';
import { downloadFile } from '../runs/files.service.js';
import { resolveLlmServiceForSession } from '../llm/llm.factory.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

interface SectionRow {
  id: number;
  optimizer_session_id: number;
  current_content: string;
  prompt_type: { description: string } | null;
}

/** System-type sections' tuned prompts, concatenated into a system instruction. */
async function buildSystemInstruction(db: SupabaseClient, sessionId: number): Promise<string> {
  const { data } = await db
    .from('optimizer_section')
    .select('current_content, prompt_sequence, sequence, prompt_type:prompt_type(description)')
    .eq('optimizer_session_id', sessionId);
  const rows = (data ?? []) as unknown as {
    current_content: string;
    prompt_sequence: number;
    sequence: number;
    prompt_type: { description: string } | null;
  }[];
  return rows
    .filter((r) => r.prompt_type?.description === 'System' && r.current_content.trim() !== '')
    .sort((a, b) => a.prompt_sequence - b.prompt_sequence || a.sequence - b.sequence)
    .map((r) => r.current_content)
    .join('\n\n');
}

/** Active session files converted to markdown (cached on the row), combined as context. */
async function buildFileContext(db: SupabaseClient, sessionId: number): Promise<string> {
  const { data } = await db
    .from('optimizer_file')
    .select('id, file_name, storage_path, markdown_content')
    .eq('optimizer_session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at');
  const files = (data ?? []) as { id: number; file_name: string; storage_path: string; markdown_content: string | null }[];
  const parts: string[] = [];
  for (const file of files) {
    let markdown = file.markdown_content;
    if (markdown === null) {
      const buffer = await downloadFile(db, file.storage_path);
      markdown = await convertToMarkdown(buffer, file.file_name);
      await db.from('optimizer_file').update({ markdown_content: markdown }).eq('id', file.id);
    }
    parts.push(`# File: ${file.file_name}\n\n${markdown}`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Runs a single optimizer section against the source documents using the tuned
 * prompt, and records the result as an optimizer_section_run (history entry).
 * Returns the created run row (status 'complete' or 'failed').
 */
export async function runSection(db: SupabaseClient, sectionId: number) {
  const { data: secData, error: secErr } = await db
    .from('optimizer_section')
    .select('id, optimizer_session_id, current_content, prompt_type:prompt_type(description)')
    .eq('id', sectionId)
    .maybeSingle();
  throwOnError(secErr, 'Load optimizer section');
  const section = requireFound(secData, 'Optimizer section') as unknown as SectionRow;

  const { service, label, modelName } = await resolveLlmServiceForSession(db, section.optimizer_session_id);
  const [systemInstruction, context] = await Promise.all([
    buildSystemInstruction(db, section.optimizer_session_id),
    buildFileContext(db, section.optimizer_session_id),
  ]);

  const started = Date.now();
  let row: Record<string, unknown>;
  try {
    const { text, inputTokens, outputTokens } = await service.generate({
      systemInstruction,
      prompt: section.current_content,
      context,
    });
    row = {
      optimizer_section_id: sectionId,
      prompt_content: section.current_content,
      output: text,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: Date.now() - started,
      model_name: modelName ?? label,
      status: 'complete',
    };
  } catch (e) {
    row = {
      optimizer_section_id: sectionId,
      prompt_content: section.current_content,
      output: '',
      latency_ms: Date.now() - started,
      model_name: modelName ?? label,
      status: 'failed',
      error_message: e instanceof Error ? e.message : 'Generation failed',
    };
  }

  const { data, error } = await db
    .from('optimizer_section_run')
    .insert(row)
    .select('id, prompt_content, output, input_tokens, output_tokens, latency_ms, model_name, status, error_message, created_at')
    .single();
  throwOnError(error, 'Record section run');
  return data;
}
