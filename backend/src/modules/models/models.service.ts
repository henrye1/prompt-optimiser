import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, requireFound } from '../../lib/supabaseError.js';

/**
 * AI models. RLS scopes every row to its owner. The raw api_key is NEVER
 * returned to the client — list/create return a masked form only.
 */

export interface AiModelView {
  id: number;
  name: string;
  created_at: string;
  provider: { id: number; name: string } | null;
  api_key_masked: string;
}

/** "AIzaSy…cEhJ" -> "AIza •••••••••• cEhJ"; short/empty keys fully masked. */
function maskKey(key: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)} •••••••••• ${key.slice(-4)}`;
}

interface ModelRow {
  id: number;
  name: string;
  api_key: string | null;
  created_at: string;
  provider: { id: number; name: string } | null;
}

function toView(row: ModelRow): AiModelView {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    provider: row.provider,
    api_key_masked: maskKey(row.api_key),
  };
}

export async function listModels(db: SupabaseClient): Promise<AiModelView[]> {
  const { data, error } = await db
    .from('ai_model')
    .select('id, name, api_key, created_at, provider:ai_model_provider(id, name)')
    .order('created_at', { ascending: false });
  throwOnError(error, 'List models');
  return (data ?? []).map((r) => toView(r as unknown as ModelRow));
}

export async function createModel(
  db: SupabaseClient,
  input: { name: string; ai_model_provider_id: number; api_key: string },
): Promise<AiModelView> {
  const { data, error } = await db
    .from('ai_model')
    .insert({
      name: input.name,
      ai_model_provider_id: input.ai_model_provider_id,
      api_key: input.api_key,
    })
    .select('id, name, api_key, created_at, provider:ai_model_provider(id, name)')
    .single();
  throwOnError(error, 'Create model');
  return toView(requireFound(data, 'Model') as unknown as ModelRow);
}

export async function deleteModel(db: SupabaseClient, id: number): Promise<void> {
  const { error } = await db.from('ai_model').delete().eq('id', id);
  throwOnError(error, 'Delete model');
}
