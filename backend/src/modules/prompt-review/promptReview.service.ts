import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../../middleware/error.js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

/** Card rows for the Prompt Review list (prompt_review_session_card view). */
export async function listSessions(db: SupabaseClient) {
  const { data, error } = await db
    .from('prompt_review_session_card')
    .select(
      'id, name, source_prompt_set_id, is_published, created_by, created_at, updated_at, ' +
        'source_name, model_name, provider_name, prompt_count, section_count',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  throwOnError(error, 'List prompt review sessions');
  return data ?? [];
}

/** Full session with its editable document (prompts → sections), ordered. */
export async function getSession(db: SupabaseClient, id: number) {
  const { data, error } = await db
    .from('prompt_review_session')
    .select(
      'id, name, source_prompt_set_id, ai_model_id, is_published, created_by, created_at, updated_at, ' +
        'source:prompt_set(name), ' +
        'ai_model:ai_model(id, name, provider:ai_model_provider(name)), ' +
        'prompts:prompt_review_prompt(id, name, prompt_type_id, sequence, ' +
        'prompt_type:prompt_type(description), ' +
        'sections:prompt_review_section(id, title, content, sequence))',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(error, 'Get prompt review session');
  const session = requireFound(data, 'Prompt Review session') as {
    prompts?: { sequence: number; sections?: { sequence: number }[] }[];
  };
  session.prompts?.sort((a, b) => a.sequence - b.sequence);
  session.prompts?.forEach((p) => p.sections?.sort((a, b) => a.sequence - b.sequence));
  return session;
}

async function systemTypeId(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('prompt_type').select('id').eq('description', 'System').maybeSingle();
  return (data as { id: number } | null)?.id ?? 1;
}

/**
 * Creates a session and snapshots the document. From a source prompt set, every
 * prompt + section is copied into the working copy; with no source, a single
 * blank System prompt is seeded.
 */
export async function createSession(
  db: SupabaseClient,
  input: { name: string; source_prompt_set_id?: number; ai_model_id?: number },
) {
  const { data: session, error: sessErr } = await db
    .from('prompt_review_session')
    .insert({
      name: input.name,
      source_prompt_set_id: input.source_prompt_set_id ?? null,
      ai_model_id: input.ai_model_id ?? null,
    })
    .select('id')
    .single();
  throwOnError(sessErr, 'Create prompt review session');
  const sessionId = (session as { id: number }).id;

  if (input.source_prompt_set_id) {
    const { data: setData, error: setErr } = await db
      .from('prompt_set')
      .select('id, prompts:prompt(id, name, prompt_type_id, sequence, sections:prompt_section(title, content, sequence))')
      .eq('id', input.source_prompt_set_id)
      .is('deleted_at', null)
      .maybeSingle();
    throwOnError(setErr, 'Load source prompt set');
    const set = requireFound(setData, 'Prompt set') as {
      prompts: {
        name: string;
        prompt_type_id: number;
        sequence: number;
        sections: { title: string; content: string; sequence: number }[];
      }[];
    };
    for (const p of [...set.prompts].sort((a, b) => a.sequence - b.sequence)) {
      await insertPromptWithSections(db, sessionId, p.name, p.prompt_type_id, p.sequence, p.sections);
    }
  } else {
    await insertPromptWithSections(db, sessionId, 'System role', await systemTypeId(db), 1, [
      { title: 'Persona', content: '', sequence: 1 },
    ]);
  }

  return getSession(db, sessionId);
}

async function insertPromptWithSections(
  db: SupabaseClient,
  sessionId: number,
  name: string,
  promptTypeId: number,
  sequence: number,
  sections: { title: string; content: string; sequence: number }[],
): Promise<void> {
  const { data: prompt, error: pErr } = await db
    .from('prompt_review_prompt')
    .insert({ prompt_review_session_id: sessionId, name, prompt_type_id: promptTypeId, sequence })
    .select('id')
    .single();
  throwOnError(pErr, 'Create prompt');
  const promptId = (prompt as { id: number }).id;
  const rows = [...sections]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s, i) => ({ prompt_review_prompt_id: promptId, title: s.title, content: s.content, sequence: s.sequence ?? i + 1 }));
  if (rows.length) {
    const { error: sErr } = await db.from('prompt_review_section').insert(rows);
    throwOnError(sErr, 'Create sections');
  }
}

export async function updateSession(
  db: SupabaseClient,
  id: number,
  patch: { name?: string; is_published?: boolean },
) {
  const { data, error } = await db
    .from('prompt_review_session')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name, is_published')
    .maybeSingle();
  throwOnError(error, 'Update prompt review session');
  return requireFound(data, 'Prompt Review session');
}

export async function softDeleteSession(db: SupabaseClient, id: number): Promise<void> {
  const { data, error } = await db
    .from('prompt_review_session')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete prompt review session');
  requireFound(data, 'Prompt Review session');
}

// ---------------------------------------------------------------------------
// Document mutations
// ---------------------------------------------------------------------------

/** Adds a new prompt (with one empty section) at the end of the document. */
export async function addPrompt(db: SupabaseClient, sessionId: number) {
  const { data: maxRow } = await db
    .from('prompt_review_prompt')
    .select('sequence')
    .eq('prompt_review_session_id', sessionId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow as { sequence: number } | null)?.sequence ?? 0) + 1;
  const { data: prompt, error } = await db
    .from('prompt_review_prompt')
    .insert({ prompt_review_session_id: sessionId, name: 'New prompt', prompt_type_id: await assessmentTypeId(db), sequence: nextSeq })
    .select('id')
    .single();
  throwOnError(error, 'Add prompt');
  const promptId = (prompt as { id: number }).id;
  const { error: sErr } = await db
    .from('prompt_review_section')
    .insert({ prompt_review_prompt_id: promptId, title: 'Instructions', content: '', sequence: 1 });
  throwOnError(sErr, 'Add section');
  return getPromptWithSections(db, promptId);
}

async function assessmentTypeId(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('prompt_type').select('id').eq('description', 'Assessment').maybeSingle();
  return (data as { id: number } | null)?.id ?? 1;
}

async function getPromptWithSections(db: SupabaseClient, promptId: number) {
  const { data, error } = await db
    .from('prompt_review_prompt')
    .select('id, name, prompt_type_id, sequence, prompt_type:prompt_type(description), sections:prompt_review_section(id, title, content, sequence)')
    .eq('id', promptId)
    .maybeSingle();
  throwOnError(error, 'Load prompt');
  const prompt = requireFound(data, 'Prompt') as { sections?: { sequence: number }[] };
  prompt.sections?.sort((a, b) => a.sequence - b.sequence);
  return prompt;
}

export async function updatePrompt(
  db: SupabaseClient,
  promptId: number,
  patch: { name?: string; prompt_type_id?: number },
) {
  const { data, error } = await db
    .from('prompt_review_prompt')
    .update(patch)
    .eq('id', promptId)
    .select('id, name, prompt_type_id')
    .maybeSingle();
  throwOnError(error, 'Update prompt');
  return requireFound(data, 'Prompt');
}

export async function deletePrompt(db: SupabaseClient, promptId: number): Promise<void> {
  await db.from('prompt_review_section').delete().eq('prompt_review_prompt_id', promptId);
  const { data, error } = await db.from('prompt_review_prompt').delete().eq('id', promptId).select('id').maybeSingle();
  throwOnError(error, 'Delete prompt');
  requireFound(data, 'Prompt');
}

export async function addSection(db: SupabaseClient, promptId: number) {
  const { data: maxRow } = await db
    .from('prompt_review_section')
    .select('sequence')
    .eq('prompt_review_prompt_id', promptId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow as { sequence: number } | null)?.sequence ?? 0) + 1;
  const { data, error } = await db
    .from('prompt_review_section')
    .insert({ prompt_review_prompt_id: promptId, title: 'New section', content: '', sequence: nextSeq })
    .select('id, title, content, sequence')
    .single();
  throwOnError(error, 'Add section');
  return data;
}

export async function updateSection(
  db: SupabaseClient,
  sectionId: number,
  patch: { title?: string; content?: string },
) {
  const { data, error } = await db
    .from('prompt_review_section')
    .update(patch)
    .eq('id', sectionId)
    .select('id, title, content, sequence')
    .maybeSingle();
  throwOnError(error, 'Update section');
  return requireFound(data, 'Section');
}

export async function deleteSection(db: SupabaseClient, sectionId: number): Promise<void> {
  const { data, error } = await db.from('prompt_review_section').delete().eq('id', sectionId).select('id').maybeSingle();
  throwOnError(error, 'Delete section');
  requireFound(data, 'Section');
}

/**
 * Publishes the working document as a NEW prompt set owned by the caller, with
 * prompts + sections rebuilt from the current document.
 */
export async function publishToSet(
  db: SupabaseClient,
  sessionId: number,
  input: { name: string; description?: string; is_published?: boolean },
) {
  const session = (await getSession(db, sessionId)) as unknown as {
    prompts: {
      name: string;
      prompt_type_id: number;
      sequence: number;
      sections: { title: string; content: string; sequence: number }[];
    }[];
  };

  const { data: newSet, error: setErr } = await db
    .from('prompt_set')
    .insert({
      name: input.name,
      description: input.description ?? '',
      version: 1,
      is_published: input.is_published ?? false,
    })
    .select('id')
    .single();
  throwOnError(setErr, 'Create prompt set');
  const newSetId = (newSet as { id: number }).id;

  for (const p of [...session.prompts].sort((a, b) => a.sequence - b.sequence)) {
    const { data: prompt, error: pErr } = await db
      .from('prompt')
      .insert({ prompt_set_id: newSetId, name: p.name, prompt_type_id: p.prompt_type_id, sequence: p.sequence })
      .select('id')
      .single();
    throwOnError(pErr, 'Create prompt');
    const promptId = (prompt as { id: number }).id;
    const rows = [...p.sections]
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({ prompt_id: promptId, title: s.title, content: s.content, sequence: s.sequence }));
    if (rows.length) {
      const { error: sErr } = await db.from('prompt_section').insert(rows);
      throwOnError(sErr, 'Create prompt sections');
    }
  }

  if (!session.prompts.length) throw new HttpError(400, 'Nothing to publish — the document is empty.');
  return { prompt_set_id: newSetId };
}
