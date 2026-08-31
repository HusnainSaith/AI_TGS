import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiErrorCode } from './generation.enums';
import {
  AiGenerationProvider,
  GenerationProviderResult,
  StructuredPromptRequest,
} from './generation.contracts';
export class OpenAiGenerationProvider implements AiGenerationProvider {
  readonly providerName = 'openai';
  constructor(private readonly config: ConfigService) {}
  async generateQuestions(prompt: StructuredPromptRequest): Promise<GenerationProviderResult> {
    const model = this.config.get<string>('aiGeneration.model'),
      apiKey = this.config.get<string>('aiGeneration.apiKey');
    if (!model || !apiKey) throw new Error(AiErrorCode.PROVIDER_NOT_CONFIGURED);
    const client = new OpenAI({
      apiKey,
      timeout: this.config.get<number>('aiGeneration.timeoutMs'),
    });
    const started = Date.now();
    try {
      const response = await client.responses.create({
        model,
        input: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: this.config.get<number>('aiGeneration.temperature'),
        max_output_tokens: this.config.get<number>('aiGeneration.maxOutputTokens'),
        text: {
          format: {
            type: 'json_schema',
            name: 'grounded_questions',
            strict: true,
            schema: prompt.schema,
          },
        },
      });
      return {
        output: response.output_text,
        latencyMs: Date.now() - started,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) throw new Error(AiErrorCode.AUTH_FAILED);
      if (status === 404) throw new Error(AiErrorCode.MODEL_NOT_FOUND);
      if (status === 429) throw new Error(AiErrorCode.RATE_LIMITED);
      if ((error as { name?: string }).name === 'AbortError') throw new Error(AiErrorCode.TIMEOUT);
      throw new Error(AiErrorCode.PROVIDER_ERROR);
    }
  }
}
