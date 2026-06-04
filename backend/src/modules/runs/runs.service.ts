import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

/**
 * Run CRUD and section snapshotting. Every function receives a SupabaseClient
 * bound to the caller's JWT, so RLS enforces ownership/publish/soft-delete.
 *
 * Status ids (seeded): 1 New, 2 In-progress, 3 Failed, 4 Complete.
 */
export const RUN_STATUS = { NEW: 1, IN_PROGRESS: 2, FAILED: 3, COMPLETE: 4 } as const;
export const SECTION_STATUS = { NEW: 1, IN_PROGRESS: 2, FAILED: 3, COMPLETE: 4 } as const;

const RUN_CARD_COLUMNS =
  'id, name, run_status_id, is_published, created_by, created_at, started_at, completed_at, ' +
  'input_tokens, output_tokens, prompt_set_name, model_name, provider_name, ' +
  'section_total, section_complete, running_section, last_error';

/** Runs visible to the caller (own + published), enriched for the list (run_card view). */
export async function listRuns(db: SupabaseClient) {
  const { data, error } = await db
    .from('run_card')
    .select(RUN_CARD_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  throwOnError(error, 'List runs');
  return data ?? [];
}

/** Full run view: sections (with their input prompt text), files, and logs. */
export async function getRun(db: SupabaseClient, id: number) {
  const { data, error } = await db
    .from('run')
    .select(
      'id, name, description, prompt_set_id, run_status_id, is_published, created_by, created_at, updated_at, ' +
        'started_at, completed_at, input_tokens, output_tokens, ' +
        'prompt_set:prompt_set(name), ' +
        'ai_model:ai_model(id, name, provider:ai_model_provider(name)), ' +
        'sections:run_section(id, title, content, run_section_status_id, sequence, error_message, ' +
        'prompt_section:prompt_section(prompt:prompt(prompt_type:prompt_type(description)))), ' +
        'files:run_file(id, file_name, mime_type, run_file_type_id, is_example_file, created_at, deleted_at), ' +
        'logs:run_log(id, level, message, created_at)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(error, 'Get run');
  const run = requireFound(data, 'Run') as {
    sections?: { sequence: number }[];
    files?: { deleted_at: string | null }[];
    logs?: { created_at: string }[];
  };
  run.sections?.sort((a, b) => a.sequence - b.sequence);
  run.files = run.files?.filter((f) => f.deleted_at === null);
  run.logs?.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return run;
}

async function systemPromptTypeId(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db
    .from('prompt_type')
    .select('id')
    .eq('description', 'System')
    .maybeSingle();
  throwOnError(error, 'Resolve System prompt type');
  return data?.id ?? null;
}

/**
 * Creates a run and snapshots its run_sections from the prompt set's non-System
 * prompt sections, ordered by prompt sequence then section sequence.
 */
export async function createRun(
  db: SupabaseClient,
  input: { name: string; description?: string; prompt_set_id: number; ai_model_id?: number },
) {
  // Load the prompt set's structure (RLS guarantees visibility).
  const { data: setData, error: setErr } = await db
    .from('prompt_set')
    .select('id, prompts:prompt(id, prompt_type_id, sequence, sections:prompt_section(id, title, sequence))')
    .eq('id', input.prompt_set_id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(setErr, 'Load prompt set for run');
  const set = requireFound(setData, 'Prompt set') as {
    prompts: { id: number; prompt_type_id: number; sequence: number; sections: { id: number; title: string; sequence: number }[] }[];
  };

  const systemId = await systemPromptTypeId(db);
  const ordered = [...set.prompts]
    .filter((p) => p.prompt_type_id !== systemId)
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((p) => [...p.sections].sort((a, b) => a.sequence - b.sequence));

  const { data: run, error: runErr } = await db
    .from('run')
    .insert({
      name: input.name,
      description: input.description ?? '',
      prompt_set_id: input.prompt_set_id,
      ai_model_id: input.ai_model_id ?? null,
      run_status_id: RUN_STATUS.NEW,
    })
    .select('id')
    .single();
  throwOnError(runErr, 'Create run');
  const runId = (run as { id: number }).id;

  if (ordered.length > 0) {
    const rows = ordered.map((sec, i) => ({
      run_id: runId,
      prompt_section_id: sec.id,
      title: sec.title,
      run_section_status_id: SECTION_STATUS.NEW,
      sequence: i + 1,
    }));
    const { error: secErr } = await db.from('run_section').insert(rows);
    throwOnError(secErr, 'Snapshot run sections');
  }

  return getRun(db, runId);
}

export async function updateRun(
  db: SupabaseClient,
  id: number,
  patch: { name?: string; description?: string; is_published?: boolean },
) {
  const { data, error } = await db
    .from('run')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name, description, run_status_id, is_published')
    .maybeSingle();
  throwOnError(error, 'Update run');
  return requireFound(data, 'Run');
}

export async function softDeleteRun(db: SupabaseClient, id: number): Promise<void> {
  const { data, error } = await db
    .from('run')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete run');
  requireFound(data, 'Run');
}
