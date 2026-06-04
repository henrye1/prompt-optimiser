import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGeminiService } from '../gemini/gemini.service.js';
import { AnthropicService } from '../anthropic/anthropic.service.js';
import type { LlmService } from './llm.types.js';

interface ResolvedLlm {
  service: LlmService;
  /** Human-readable description for the run log (never includes the API key). */
  label: string;
}

interface RunModelRow {
  ai_model: {
    name: string;
    api_key: string | null;
    provider: { name: string } | null;
  } | null;
}

/**
 * Picks the generation service for a run based on its selected model:
 * the model's own API key and name (used as the API model id) drive the call.
 * Falls back to the server Gemini key when no model is selected or its key
 * isn't readable (e.g. executing another user's published run).
 */
export async function resolveLlmServiceForRun(db: SupabaseClient, runId: number): Promise<ResolvedLlm> {
  const { data } = await db
    .from('run')
    .select('ai_model:ai_model(name, api_key, provider:ai_model_provider(name))')
    .eq('id', runId)
    .maybeSingle();

  const model = (data as RunModelRow | null)?.ai_model ?? null;

  if (!model?.api_key) {
    return { service: new GoogleGeminiService(), label: 'server default (Gemini)' };
  }

  const provider = (model.provider?.name ?? '').toLowerCase();
  if (provider.includes('anthropic')) {
    return { service: new AnthropicService(model.api_key, model.name), label: `Anthropic · ${model.name}` };
  }
  // Default to Google for Google-provider models (and any unknown provider).
  return { service: new GoogleGeminiService(model.api_key, model.name), label: `Google · ${model.name}` };
}
