import type { SupabaseClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import type { GeminiService } from '../gemini/gemini.service.js';
import { convertToMarkdown } from '../../lib/markdown.js';
import { getActiveFiles, downloadFile, cacheMarkdown } from './files.service.js';
import { RUN_STATUS, SECTION_STATUS } from './runs.service.js';

const CONCURRENCY = 4;

async function log(db: SupabaseClient, runId: number, level: string, message: string): Promise<void> {
  await db.from('run_log').insert({ run_id: runId, level, message });
}

/** Concatenates System-type prompt sections into a single system instruction. */
async function buildSystemInstruction(db: SupabaseClient, runId: number): Promise<string> {
  const { data: run } = await db.from('run').select('prompt_set_id').eq('id', runId).maybeSingle();
  const setId = (run as { prompt_set_id: number } | null)?.prompt_set_id;
  if (!setId) return '';

  const { data: sysType } = await db
    .from('prompt_type')
    .select('id')
    .eq('description', 'System')
    .maybeSingle();
  const systemId = (sysType as { id: number } | null)?.id;
  if (!systemId) return '';

  const { data: prompts } = await db
    .from('prompt')
    .select('sequence, prompt_type_id, sections:prompt_section(content, sequence)')
    .eq('prompt_set_id', setId)
    .eq('prompt_type_id', systemId);

  const list = (prompts ?? []) as { sequence: number; sections: { content: string; sequence: number }[] }[];
  return list
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((p) => [...p.sections].sort((a, b) => a.sequence - b.sequence).map((s) => s.content))
    .filter((c) => c.trim() !== '')
    .join('\n\n');
}

/** Converts any not-yet-converted files to markdown (caching), returns combined context. */
async function buildFileContext(db: SupabaseClient, runId: number): Promise<string> {
  const files = await getActiveFiles(db, runId);
  const parts: string[] = [];
  for (const file of files) {
    let markdown = file.markdown_content;
    if (markdown === null) {
      const buffer = await downloadFile(db, file.storage_path);
      markdown = await convertToMarkdown(buffer, file.file_name);
      await cacheMarkdown(db, file.id, markdown);
      await log(db, runId, 'info', `Converted ${file.file_name} to markdown (${markdown.length} chars)`);
    }
    parts.push(`# File: ${file.file_name}\n\n${markdown}`);
  }
  return parts.join('\n\n---\n\n');
}

interface SectionToRun {
  id: number;
  sequence: number;
  prompt_section: { content: string } | null;
}

/**
 * Executes a run: builds the system instruction and file context, then makes one
 * independent Gemini call per section (bounded concurrency), writing output,
 * status, and logs. Aggregates the run status at the end. Safe to re-run.
 */
export async function executeRun(
  db: SupabaseClient,
  gemini: GeminiService,
  runId: number,
): Promise<void> {
  await db.from('run').update({ run_status_id: RUN_STATUS.IN_PROGRESS }).eq('id', runId);
  await log(db, runId, 'info', 'Run started');

  try {
    const [systemInstruction, context] = await Promise.all([
      buildSystemInstruction(db, runId),
      buildFileContext(db, runId),
    ]);

    const { data: secData } = await db
      .from('run_section')
      .select('id, sequence, prompt_section:prompt_section(content)')
      .eq('run_id', runId)
      .order('sequence');
    const sections = (secData ?? []) as unknown as SectionToRun[];

    const limit = pLimit(CONCURRENCY);
    const results = await Promise.all(
      sections.map((section) =>
        limit(async () => {
          await db
            .from('run_section')
            .update({ run_section_status_id: SECTION_STATUS.IN_PROGRESS })
            .eq('id', section.id);
          try {
            const prompt = section.prompt_section?.content ?? '';
            const output = await gemini.generate({ systemInstruction, prompt, context });
            await db
              .from('run_section')
              .update({
                content: output,
                run_section_status_id: SECTION_STATUS.COMPLETE,
                error_message: null,
              })
              .eq('id', section.id);
            await log(db, runId, 'info', `Section ${section.sequence} complete`);
            return true;
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Generation failed';
            await db
              .from('run_section')
              .update({ run_section_status_id: SECTION_STATUS.FAILED, error_message: message })
              .eq('id', section.id);
            await log(db, runId, 'error', `Section ${section.sequence} failed: ${message}`);
            return false;
          }
        }),
      ),
    );

    const anyFailed = results.includes(false);
    const finalStatus = anyFailed ? RUN_STATUS.FAILED : RUN_STATUS.COMPLETE;
    await db.from('run').update({ run_status_id: finalStatus }).eq('id', runId);
    await log(db, runId, anyFailed ? 'error' : 'info', anyFailed ? 'Run finished with failures' : 'Run complete');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Run failed';
    await db.from('run').update({ run_status_id: RUN_STATUS.FAILED }).eq('id', runId);
    await log(db, runId, 'error', `Run failed: ${message}`);
  }
}
