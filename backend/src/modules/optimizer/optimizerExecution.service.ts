import type { SupabaseClient } from '@supabase/supabase-js';
import { convertToMarkdown } from '../../lib/markdown.js';
import { downloadFile } from '../runs/files.service.js';
import { resolveLlmServiceForSession } from '../llm/llm.factory.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';
import { HttpError } from '../../middleware/error.js';

interface SectionRow {
  id: number;
  optimizer_session_id: number;
  original_content: string;
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
      try {
        const buffer = await downloadFile(db, file.storage_path);
        markdown = await convertToMarkdown(buffer, file.file_name);
        await db.from('optimizer_file').update({ markdown_content: markdown }).eq('id', file.id);
      } catch (e) {
        // One unreadable file (e.g. an unsupported format) shouldn't fail the run.
        // eslint-disable-next-line no-console
        console.error(`Skipping unreadable file ${file.file_name}:`, e instanceof Error ? e.message : e);
        continue;
      }
    }
    parts.push(`# File: ${file.file_name}\n\n${markdown}`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Runs a single optimizer section against the source documents and records the
 * result as an optimizer_section_run (history entry). Returns the created run
 * row (status 'complete' or 'failed').
 *
 * By default the section's tuned (current) prompt is run. With `{ baseline: true }`
 * the ORIGINAL prompt is run instead and the row is flagged `is_baseline` — used
 * to compare the edited output against the original. System instruction and file
 * context are built identically either way, so only this section's prompt varies.
 */
export async function runSection(db: SupabaseClient, sectionId: number, opts: { baseline?: boolean } = {}) {
  const { data: secData, error: secErr } = await db
    .from('optimizer_section')
    .select('id, optimizer_session_id, original_content, current_content, prompt_type:prompt_type(description)')
    .eq('id', sectionId)
    .maybeSingle();
  throwOnError(secErr, 'Load optimizer section');
  const section = requireFound(secData, 'Optimizer section') as unknown as SectionRow;

  const baseline = opts.baseline === true;
  const promptContent = baseline ? section.original_content : section.current_content;

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
      prompt: promptContent,
      context,
    });
    row = {
      optimizer_section_id: sectionId,
      prompt_content: promptContent,
      output: text,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: Date.now() - started,
      model_name: modelName ?? label,
      status: 'complete',
      is_baseline: baseline,
    };
  } catch (e) {
    row = {
      optimizer_section_id: sectionId,
      prompt_content: promptContent,
      output: '',
      latency_ms: Date.now() - started,
      model_name: modelName ?? label,
      status: 'failed',
      error_message: e instanceof Error ? e.message : 'Generation failed',
      is_baseline: baseline,
    };
  }

  const { data, error } = await db
    .from('optimizer_section_run')
    .insert(row)
    .select('id, prompt_content, output, input_tokens, output_tokens, latency_ms, model_name, status, error_message, created_at, is_baseline')
    .single();
  throwOnError(error, 'Record section run');
  return data;
}

/**
 * Asks the session's attached model to rewrite a section's prompt so it better
 * achieves the user's stated goal, preserving the original intent. Returns the
 * suggested rewrite as plain text — no run is recorded and nothing is persisted;
 * the caller decides whether to apply it.
 */
export async function improveSection(
  db: SupabaseClient,
  sectionId: number,
  goal: string,
): Promise<{ suggestion: string }> {
  const { data: secData, error: secErr } = await db
    .from('optimizer_section')
    .select('id, optimizer_session_id, current_content')
    .eq('id', sectionId)
    .maybeSingle();
  throwOnError(secErr, 'Load optimizer section');
  const section = requireFound(secData, 'Optimizer section') as {
    id: number;
    optimizer_session_id: number;
    current_content: string;
  };

  const { service } = await resolveLlmServiceForSession(db, section.optimizer_session_id);
  const instruction =
    'You are refining a single instruction (a "prompt") that is fed to an AI model inside an automated document-analysis tool. ' +
    "Rewrite the prompt so it better achieves the user's goal, while preserving its original intent and any concrete requirements. " +
    'Keep it concise and in the same instructional voice. ' +
    'Return ONLY the rewritten prompt text — no preamble, no quotation marks, no explanation, no markdown.\n\n' +
    `User's goal: ${goal}\n\n` +
    `Current prompt:\n${section.current_content}`;

  const { text } = await service.generate({ prompt: instruction });
  const suggestion = text.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!suggestion) {
    throw new HttpError(502, 'The model returned an empty suggestion. Try rephrasing your goal.');
  }
  return { suggestion };
}
