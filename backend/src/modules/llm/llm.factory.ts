import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGeminiService } from '../gemini/gemini.service.js';
import { AnthropicService } from '../anthropic/anthropic.service.js';
import type { LlmService } from './llm.types.js';

export interface ResolvedLlm {
  service: LlmService;
  /** Human-readable description for logs/history (never includes the API key). */
  label: string;
  /** The model id sent to the provider (ai_model.name), or null when falling back. */
  modelName: string | null;
}

interface ModelRow {
  name: string;
  api_key: string | null;
  provider: { name: string } | null;
}

/** Maps a connected model to a generation service, falling back to the server Gemini key. */
function buildLlm(model: ModelRow | null): ResolvedLlm {
  if (!model?.api_key) {
    return { service: new GoogleGeminiService(), label: 'server default (Gemini)', modelName: null };
  }
  const provider = (model.provider?.name ?? '').toLowerCase();
  if (provider.includes('anthropic')) {
    return { service: new AnthropicService(model.api_key, model.name), label: `Anthropic · ${model.name}`, modelName: model.name };
  }
  // Default to Google for Google-provider models (and any unknown provider).
  return { service: new GoogleGeminiService(model.api_key, model.name), label: `Google · ${model.name}`, modelName: model.name };
}

/** Generation service for a run, based on its selected model. */
export async function resolveLlmServiceForRun(db: SupabaseClient, runId: number): Promise<ResolvedLlm> {
  const { data } = await db
    .from('run')
    .select('ai_model:ai_model(name, api_key, provider:ai_model_provider(name))')
    .eq('id', runId)
    .maybeSingle();
  return buildLlm((data as { ai_model: ModelRow | null } | null)?.ai_model ?? null);
}

/** Generation service for an optimizer session, based on its selected model. */
export async function resolveLlmServiceForSession(db: SupabaseClient, sessionId: number): Promise<ResolvedLlm> {
  const { data } = await db
    .from('optimizer_session')
    .select('ai_model:ai_model(name, api_key, provider:ai_model_provider(name))')
    .eq('id', sessionId)
    .maybeSingle();
  return buildLlm((data as { ai_model: ModelRow | null } | null)?.ai_model ?? null);
}
