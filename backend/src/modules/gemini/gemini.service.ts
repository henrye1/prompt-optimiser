import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import type { GenerateParams, GenerateResult, LlmService } from '../llm/llm.types.js';

export type { GenerateParams, GenerateResult } from '../llm/llm.types.js';

/** Real implementation backed by the @google/genai SDK. */
export class GoogleGeminiService implements LlmService {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string = env.gemini.apiKey, model: string = env.gemini.model) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model || env.gemini.model;
  }

  async generate({ systemInstruction, prompt, context }: GenerateParams): Promise<GenerateResult> {
    const contents = context ? `${context}\n\n---\n\n${prompt}` : prompt;
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      ...(systemInstruction ? { config: { systemInstruction } } : {}),
    });
    const usage = response.usageMetadata;
    return {
      text: response.text ?? '',
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
    };
  }
}
