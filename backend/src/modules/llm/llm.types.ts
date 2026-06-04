/** Shared seam over text-generation providers (Gemini, Anthropic, …) so the run
 * executor can target the run's selected model — and be tested with a fake. */

export interface GenerateParams {
  /** System instruction assembled from System-type prompt sections. */
  systemInstruction?: string;
  /** The user-facing prompt content for this section. */
  prompt: string;
  /** Shared context (e.g. uploaded files converted to markdown). Prepended to the prompt. */
  context?: string;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmService {
  generate(params: GenerateParams): Promise<GenerateResult>;
}
