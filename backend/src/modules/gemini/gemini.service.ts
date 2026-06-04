import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';

export interface GenerateParams {
  /** System instruction assembled from System-type prompt sections. */
  systemInstruction?: string;
  /** The user-facing prompt content for this section. */
  prompt: string;
  /** Shared context (e.g. uploaded files converted to markdown). Prepended to the prompt. */
  context?: string;
}

/** Seam over Gemini text generation so the run executor can be tested with a fake. */
export interface GeminiService {
  generate(params: GenerateParams): Promise<string>;
}

/** Real implementation backed by the @google/genai SDK. */
export class GoogleGeminiService implements GeminiService {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string = env.gemini.apiKey, model: string = env.gemini.model) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate({ systemInstruction, prompt, context }: GenerateParams): Promise<string> {
    const contents = context ? `${context}\n\n---\n\n${prompt}` : prompt;
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      ...(systemInstruction ? { config: { systemInstruction } } : {}),
    });
    return response.text ?? '';
  }
}
