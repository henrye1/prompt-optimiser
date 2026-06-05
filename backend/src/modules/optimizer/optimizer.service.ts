import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/error.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

const BUCKET = env.supabase.storageBucket;

/** Card rows for the Optimizer list (optimizer_session_card view). */
export async function listSessions(db: SupabaseClient) {
  const { data, error } = await db
    .from('optimizer_session_card')
    .select(
      'id, name, prompt_set_id, is_published, created_by, created_at, updated_at, ' +
        'prompt_set_name, model_name, provider_name, financial_count, rating_count, run_count, last_run_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  throwOnError(error, 'List optimizer sessions');
  return data ?? [];
}

/** Full session: model, prompt set, sections (with run history), and files. */
export async function getSession(db: SupabaseClient, id: number) {
  const { data, error } = await db
    .from('optimizer_session')
    .select(
      'id, name, prompt_set_id, ai_model_id, is_published, created_by, created_at, updated_at, ' +
        'prompt_set:prompt_set(name), ' +
        'ai_model:ai_model(id, name, provider:ai_model_provider(name)), ' +
        'sections:optimizer_section(id, prompt_section_id, prompt_name, prompt_type_id, prompt_sequence, title, sequence, ' +
        'original_content, current_content, ' +
        'prompt_type:prompt_type(description), ' +
        'runs:optimizer_section_run(id, prompt_content, output, input_tokens, output_tokens, latency_ms, model_name, status, error_message, created_at, is_baseline)), ' +
        'files:optimizer_file(id, file_name, mime_type, run_file_type_id, is_example_file, created_at, deleted_at)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(error, 'Get optimizer session');
  const session = requireFound(data, 'Optimizer session') as {
    sections?: { prompt_sequence: number; sequence: number; runs?: { created_at: string }[] }[];
    files?: { deleted_at: string | null }[];
  };
  session.sections?.sort((a, b) => a.prompt_sequence - b.prompt_sequence || a.sequence - b.sequence);
  session.sections?.forEach((s) => s.runs?.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  session.files = session.files?.filter((f) => f.deleted_at === null);
  return session;
}

/**
 * Creates a session and snapshots every section of the prompt set (System +
 * Assessment + Audit) into editable optimizer_sections.
 */
export async function createSession(
  db: SupabaseClient,
  input: { name: string; prompt_set_id: number; ai_model_id?: number },
) {
  const { data: setData, error: setErr } = await db
    .from('prompt_set')
    .select('id, prompts:prompt(id, name, prompt_type_id, sequence, sections:prompt_section(id, title, content, sequence))')
    .eq('id', input.prompt_set_id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(setErr, 'Load prompt set for session');
  const set = requireFound(setData, 'Prompt set') as {
    prompts: {
      id: number;
      name: string;
      prompt_type_id: number;
      sequence: number;
      sections: { id: number; title: string; content: string; sequence: number }[];
    }[];
  };

  const { data: session, error: sessErr } = await db
    .from('optimizer_session')
    .insert({ name: input.name, prompt_set_id: input.prompt_set_id, ai_model_id: input.ai_model_id ?? null })
    .select('id')
    .single();
  throwOnError(sessErr, 'Create optimizer session');
  const sessionId = (session as { id: number }).id;

  const rows = [...set.prompts]
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((p) =>
      [...p.sections]
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({
          optimizer_session_id: sessionId,
          prompt_section_id: s.id,
          prompt_name: p.name,
          prompt_type_id: p.prompt_type_id,
          prompt_sequence: p.sequence,
          title: s.title,
          sequence: s.sequence,
          original_content: s.content,
          current_content: s.content,
        })),
    );
  if (rows.length > 0) {
    const { error: secErr } = await db.from('optimizer_section').insert(rows);
    throwOnError(secErr, 'Snapshot optimizer sections');
  }

  return getSession(db, sessionId);
}

export async function updateSession(
  db: SupabaseClient,
  id: number,
  patch: { name?: string; is_published?: boolean },
) {
  const { data, error } = await db
    .from('optimizer_session')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name, is_published')
    .maybeSingle();
  throwOnError(error, 'Update optimizer session');
  return requireFound(data, 'Optimizer session');
}

export async function softDeleteSession(db: SupabaseClient, id: number): Promise<void> {
  const { data, error } = await db
    .from('optimizer_session')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete optimizer session');
  requireFound(data, 'Optimizer session');
}

/** Updates a section's tuned prompt (session-local; never touches the prompt set). */
export async function updateSection(db: SupabaseClient, sectionId: number, currentContent: string) {
  const { data, error } = await db
    .from('optimizer_section')
    .update({ current_content: currentContent })
    .eq('id', sectionId)
    .select('id, current_content')
    .maybeSingle();
  throwOnError(error, 'Update optimizer section');
  return requireFound(data, 'Optimizer section');
}

/**
 * Writes the session's tuned prompts out as a NEW VERSION of the prompt set:
 * a fresh prompt_set (version + 1) owned by the caller, with prompts/sections
 * rebuilt from current_content. The original set is left untouched.
 */
export async function saveToPromptSet(db: SupabaseClient, sessionId: number) {
  const { data: sessData, error: sessErr } = await db
    .from('optimizer_session')
    .select(
      'id, prompt_set_id, prompt_set:prompt_set(name, description, version), ' +
        'sections:optimizer_section(prompt_name, prompt_type_id, prompt_sequence, title, sequence, current_content)',
    )
    .eq('id', sessionId)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(sessErr, 'Load session for save');
  const session = requireFound(sessData, 'Optimizer session') as unknown as {
    prompt_set: { name: string; description: string; version: number } | null;
    sections: {
      prompt_name: string;
      prompt_type_id: number;
      prompt_sequence: number;
      title: string;
      sequence: number;
      current_content: string;
    }[];
  };
  if (!session.prompt_set) throw new HttpError(400, 'Source prompt set is unavailable');

  const { data: newSet, error: newSetErr } = await db
    .from('prompt_set')
    .insert({
      name: session.prompt_set.name,
      description: session.prompt_set.description,
      version: session.prompt_set.version + 1,
    })
    .select('id, version')
    .single();
  throwOnError(newSetErr, 'Create new prompt set version');
  const newSetId = (newSet as { id: number; version: number }).id;

  // Group sections back into their parent prompts.
  const prompts = new Map<number, { name: string; prompt_type_id: number; sequence: number; sections: typeof session.sections }>();
  for (const sec of session.sections) {
    const key = sec.prompt_sequence;
    if (!prompts.has(key)) {
      prompts.set(key, { name: sec.prompt_name, prompt_type_id: sec.prompt_type_id, sequence: sec.prompt_sequence, sections: [] });
    }
    prompts.get(key)!.sections.push(sec);
  }

  for (const p of [...prompts.values()].sort((a, b) => a.sequence - b.sequence)) {
    const { data: prompt, error: pErr } = await db
      .from('prompt')
      .insert({ prompt_set_id: newSetId, name: p.name, prompt_type_id: p.prompt_type_id, sequence: p.sequence })
      .select('id')
      .single();
    throwOnError(pErr, 'Create prompt');
    const promptId = (prompt as { id: number }).id;
    const sectionRows = [...p.sections]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({ prompt_id: promptId, title: s.title, content: s.current_content, sequence: s.sequence }));
    if (sectionRows.length > 0) {
      const { error: sErr } = await db.from('prompt_section').insert(sectionRows);
      throwOnError(sErr, 'Create prompt sections');
    }
  }

  return { prompt_set_id: newSetId, version: (newSet as { version: number }).version };
}

// ---- files ----
export async function uploadSessionFile(
  db: SupabaseClient,
  userId: string,
  sessionId: number,
  input: { buffer: Buffer; fileName: string; mimeType: string; runFileTypeId: number; isExampleFile: boolean },
) {
  const safeName = input.fileName.replace(/[^\w.\-]+/g, '_');
  const path = `${userId}/optimizer-${sessionId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, input.buffer, { contentType: input.mimeType, upsert: false });
  if (upErr) throw new HttpError(500, `Upload failed: ${upErr.message}`);

  const { data, error } = await db
    .from('optimizer_file')
    .insert({
      optimizer_session_id: sessionId,
      run_file_type_id: input.runFileTypeId,
      file_name: input.fileName,
      mime_type: input.mimeType,
      storage_path: path,
      is_example_file: input.isExampleFile,
    })
    .select('id, file_name, mime_type, run_file_type_id, is_example_file, created_at')
    .single();
  throwOnError(error, 'Record optimizer file');
  return data;
}

export async function softDeleteFile(db: SupabaseClient, fileId: number): Promise<void> {
  const { data, error } = await db
    .from('optimizer_file')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete optimizer file');
  requireFound(data, 'File');
}
