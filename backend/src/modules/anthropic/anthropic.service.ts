import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import type { GenerateParams, GenerateResult, LlmService } from '../llm/llm.types.js';

/** Text generation backed by the Anthropic Messages API. The API key and model
 * id come from the run's selected model (ai_model.api_key / ai_model.name). */
export class AnthropicService implements LlmService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate({ systemInstruction, prompt, context }: GenerateParams): Promise<GenerateResult> {
    const content = context ? `${context}\n\n---\n\n${prompt}` : prompt;
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: env.anthropic.maxTokens,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      messages: [{ role: 'user', content }],
    });
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return {
      text,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}
