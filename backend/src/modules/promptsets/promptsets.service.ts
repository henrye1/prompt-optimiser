import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';
import { HttpError } from '../../middleware/error.js';

/**
 * Data access for prompt sets and their nested prompts/sections. Every function
 * receives a SupabaseClient bound to the caller's JWT, so RLS enforces
 * ownership/publish/soft-delete — these functions add no ownership checks.
 */

export interface PromptSetSummary {
  id: number;
  name: string;
  description: string;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  prompt_count: number;
  section_count: number;
  system_count: number;
  assessment_count: number;
  audit_count: number;
  run_count: number;
}

const CARD_COLUMNS =
  'id, name, description, version, is_published, created_at, updated_at, ' +
  'prompt_count, section_count, system_count, assessment_count, audit_count, run_count';

async function nextSequence(
  db: SupabaseClient,
  table: 'prompt' | 'prompt_section',
  fkColumn: 'prompt_set_id' | 'prompt_id',
  fkValue: number,
): Promise<number> {
  const { data, error } = await db
    .from(table)
    .select('sequence')
    .eq(fkColumn, fkValue)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnError(error, `Read ${table} sequence`);
  return (data?.sequence ?? 0) + 1;
}

export async function listPromptSets(
  db: SupabaseClient,
  ownerId?: string,
): Promise<PromptSetSummary[]> {
  let query = db.from('prompt_set_card').select(CARD_COLUMNS).is('deleted_at', null);
  if (ownerId) query = query.eq('created_by', ownerId);
  const { data, error } = await query.order('updated_at', { ascending: false });
  throwOnError(error, 'List prompt sets');
  return (data ?? []) as unknown as PromptSetSummary[];
}

export async function createPromptSet(db: SupabaseClient, name: string, description = '') {
  const { data, error } = await db
    .from('prompt_set')
    .insert({ name, description })
    .select('id, name, description, version, is_published, created_at, updated_at')
    .single();
  throwOnError(error, 'Create prompt set');
  return data;
}

/** Returns the prompt set with nested prompts and sections, ordered by sequence. */
export async function getPromptSet(db: SupabaseClient, id: number) {
  const { data, error } = await db
    .from('prompt_set')
    .select(
      'id, name, description, version, is_published, created_at, updated_at, ' +
        'prompts:prompt(id, name, prompt_type_id, sequence, ' +
        'sections:prompt_section(id, title, content, sequence))',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  throwOnError(error, 'Get prompt set');
  const set = requireFound(data, 'Prompt set') as {
    prompts?: { sequence: number; sections?: { sequence: number }[] }[];
  };

  // PostgREST does not guarantee embedded ordering; sort here.
  set.prompts?.sort((a, b) => a.sequence - b.sequence);
  for (const p of set.prompts ?? []) p.sections?.sort((a, b) => a.sequence - b.sequence);
  return set;
}

export async function updatePromptSet(
  db: SupabaseClient,
  id: number,
  patch: { name?: string; description?: string; is_published?: boolean },
) {
  const { data, error } = await db
    .from('prompt_set')
    .update(patch)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name, description, version, is_published, created_at, updated_at')
    .maybeSingle();
  throwOnError(error, 'Update prompt set');
  return requireFound(data, 'Prompt set');
}

export async function softDeletePromptSet(db: SupabaseClient, id: number): Promise<void> {
  const { data, error } = await db
    .from('prompt_set')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Delete prompt set');
  requireFound(data, 'Prompt set');
}

export async function addPrompt(
  db: SupabaseClient,
  promptSetId: number,
  input: { name: string; prompt_type_id: number; sequence?: number },
) {
  const sequence = input.sequence ?? (await nextSequence(db, 'prompt', 'prompt_set_id', promptSetId));
  const { data, error } = await db
    .from('prompt')
    .insert({
      prompt_set_id: promptSetId,
      name: input.name,
      prompt_type_id: input.prompt_type_id,
      sequence,
    })
    .select('id, name, prompt_type_id, sequence')
    .single();
  throwOnError(error, 'Add prompt');
  return data;
}

export async function updatePrompt(
  db: SupabaseClient,
  id: number,
  patch: { name?: string; prompt_type_id?: number; sequence?: number },
) {
  const { data, error } = await db
    .from('prompt')
    .update(patch)
    .eq('id', id)
    .select('id, name, prompt_type_id, sequence')
    .maybeSingle();
  throwOnError(error, 'Update prompt');
  return requireFound(data, 'Prompt');
}

export async function deletePrompt(db: SupabaseClient, id: number): Promise<void> {
  // Remove child sections first (no FK cascade defined), then the prompt.
  const childDelete = await db.from('prompt_section').delete().eq('prompt_id', id);
  throwOnError(childDelete.error, 'Delete prompt sections');
  const { error } = await db.from('prompt').delete().eq('id', id);
  throwOnError(error, 'Delete prompt');
}

export async function addSection(
  db: SupabaseClient,
  promptId: number,
  input: { title: string; content?: string; sequence?: number },
) {
  const sequence = input.sequence ?? (await nextSequence(db, 'prompt_section', 'prompt_id', promptId));
  const { data, error } = await db
    .from('prompt_section')
    .insert({
      prompt_id: promptId,
      title: input.title,
      content: input.content ?? '',
      sequence,
    })
    .select('id, title, content, sequence')
    .single();
  throwOnError(error, 'Add section');
  return data;
}

export async function updateSection(
  db: SupabaseClient,
  id: number,
  patch: { title?: string; content?: string; sequence?: number },
) {
  const { data, error } = await db
    .from('prompt_section')
    .update(patch)
    .eq('id', id)
    .select('id, title, content, sequence')
    .maybeSingle();
  throwOnError(error, 'Update section');
  return requireFound(data, 'Section');
}

export async function deleteSection(db: SupabaseClient, id: number): Promise<void> {
  const { error } = await db.from('prompt_section').delete().eq('id', id);
  throwOnError(error, 'Delete section');
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------

interface SectionInput {
  title: string;
  content?: string;
}
interface PromptInput {
  name: string;
  type?: string; // prompt type by description, e.g. "Assessment"
  prompt_type_id?: number; // alternative to `type`
  sections?: SectionInput[];
}
interface PromptSetInput {
  name: string;
  prompts?: PromptInput[];
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

/** Builds a case-insensitive map of prompt type description -> id. */
async function promptTypeMap(db: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await db.from('prompt_type').select('id, description');
  throwOnError(error, 'Load prompt types');
  const map = new Map<string, number>();
  for (const t of (data ?? []) as { id: number; description: string }[]) {
    map.set(t.description.toLowerCase(), t.id);
  }
  return map;
}

function resolveTypeId(p: PromptInput, types: Map<string, number>, label: string): number {
  if (typeof p.prompt_type_id === 'number') {
    if (![...types.values()].includes(p.prompt_type_id)) {
      throw new HttpError(400, `${label}: unknown prompt_type_id ${p.prompt_type_id}`);
    }
    return p.prompt_type_id;
  }
  const name = asString(p.type, `${label}.type`).toLowerCase();
  const id = types.get(name);
  if (!id) {
    throw new HttpError(400, `${label}: unknown type "${p.type}" (expected one of: ${[...types.keys()].join(', ')})`);
  }
  return id;
}

function validateSections(raw: unknown, label: string): SectionInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, `${label}.sections must be an array`);
  return raw.map((s, i) => {
    if (typeof s !== 'object' || s === null) throw new HttpError(400, `${label}.sections[${i}] must be an object`);
    const sec = s as Record<string, unknown>;
    return {
      title: asString(sec.title, `${label}.sections[${i}].title`),
      content: typeof sec.content === 'string' ? sec.content : '',
    };
  });
}

/** Inserts one prompt and its sections under a set, at the given 1-based sequence. */
async function insertPromptWithSections(
  db: SupabaseClient,
  promptSetId: number,
  input: PromptInput,
  types: Map<string, number>,
  sequence: number | undefined,
  label: string,
): Promise<void> {
  const typeId = resolveTypeId(input, types, label);
  const sections = validateSections(input.sections, label);
  const prompt = requireFound(
    await addPrompt(db, promptSetId, {
      name: asString(input.name, `${label}.name`),
      prompt_type_id: typeId,
      sequence,
    }),
    'Prompt',
  );
  for (let i = 0; i < sections.length; i++) {
    await addSection(db, prompt.id, {
      title: sections[i].title,
      content: sections[i].content ?? '',
      sequence: i + 1,
    });
  }
}

/** Imports a full prompt set (always creates a NEW set) with nested prompts and sections. */
export async function importPromptSet(db: SupabaseClient, payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    throw new HttpError(400, 'Body must be a prompt set object');
  }
  const input = payload as PromptSetInput;
  const name = asString(input.name, 'name');
  if (input.prompts !== undefined && !Array.isArray(input.prompts)) {
    throw new HttpError(400, 'prompts must be an array');
  }

  const types = await promptTypeMap(db);
  const created = requireFound(await createPromptSet(db, name), 'Prompt set');

  const prompts = input.prompts ?? [];
  for (let i = 0; i < prompts.length; i++) {
    await insertPromptWithSections(db, created.id, prompts[i], types, i + 1, `prompts[${i}]`);
  }
  return getPromptSet(db, created.id);
}

/** Imports a single prompt (with its sections) into an existing set, appended after existing prompts. */
export async function importPrompt(db: SupabaseClient, promptSetId: number, payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    throw new HttpError(400, 'Body must be a prompt object');
  }
  const types = await promptTypeMap(db);
  await insertPromptWithSections(db, promptSetId, payload as PromptInput, types, undefined, 'prompt');
  return getPromptSet(db, promptSetId);
}

/** Imports sections (from `{ sections: [...] }` or a bare array) into an existing prompt, appended. */
export async function importSections(db: SupabaseClient, promptId: number, payload: unknown) {
  const raw = Array.isArray(payload)
    ? payload
    : (payload as { sections?: unknown } | null)?.sections;
  const sections = validateSections(raw, 'body');
  for (const sec of sections) {
    await addSection(db, promptId, { title: sec.title, content: sec.content ?? '' });
  }
  return getPromptSet(db, await promptSetIdForPrompt(db, promptId));
}

async function promptSetIdForPrompt(db: SupabaseClient, promptId: number): Promise<number> {
  const { data, error } = await db.from('prompt').select('prompt_set_id').eq('id', promptId).maybeSingle();
  throwOnError(error, 'Resolve prompt set');
  return (requireFound(data, 'Prompt') as { prompt_set_id: number }).prompt_set_id;
}
