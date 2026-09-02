import { ConfigService } from '@nestjs/config';
import {
  OpenRouterHttpConfig,
  OpenRouterHttpError,
  postOpenRouter,
} from '../../infrastructure/providers/openrouter-http';
import { AiErrorCode } from './generation.enums';
import {
  AiGenerationProvider,
  GenerationProviderResult,
  StructuredPromptRequest,
} from './generation.contracts';

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenRouterAiGenerationProvider implements AiGenerationProvider {
  readonly providerName = 'openrouter';
  constructor(private readonly config: ConfigService) {}

  async generateQuestions(prompt: StructuredPromptRequest): Promise<GenerationProviderResult> {
    const model = this.config.get<string>('aiGeneration.model');
    const http = this.httpConfig();
    if (!model || !http.apiKey) throw new Error(AiErrorCode.PROVIDER_NOT_CONFIGURED);
    const started = Date.now();
    const retries = this.config.get<number>('aiGeneration.maxRetries') ?? 1;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = (await postOpenRouter(http, '/chat/completions', {
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: this.config.get<number>('aiGeneration.temperature') ?? 0.2,
          max_tokens: this.config.get<number>('aiGeneration.maxOutputTokens') ?? 4000,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'grounded_questions', strict: true, schema: prompt.schema },
          },
          provider: { require_parameters: true },
        })) as ChatResponse;
        const output = response.choices?.[0]?.message?.content;
        if (typeof output !== 'string' || !output.trim())
          throw new Error(AiErrorCode.INVALID_RESPONSE);
        return {
          output,
          latencyMs: Date.now() - started,
          usage: response.usage
            ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
        };
      } catch (error) {
        const mapped = this.mapError(error);
        const retryable =
          mapped === AiErrorCode.RATE_LIMITED || mapped === AiErrorCode.PROVIDER_ERROR;
        if (!retryable || attempt >= retries) throw new Error(mapped);
      }
    }
  }

  private httpConfig(): OpenRouterHttpConfig {
    return {
      apiKey: this.config.get<string>('openRouter.apiKey') ?? '',
      baseUrl: this.config.get<string>('openRouter.baseUrl') ?? 'https://openrouter.ai/api/v1',
      httpReferer: this.config.get<string>('openRouter.httpReferer') || undefined,
      appName: this.config.get<string>('openRouter.appName') || undefined,
      timeoutMs: this.config.get<number>('aiGeneration.timeoutMs') ?? 60000,
    };
  }

  private mapError(error: unknown) {
    if (error instanceof Error && Object.values(AiErrorCode).includes(error.message as AiErrorCode))
      return error.message as AiErrorCode;
    if (error instanceof OpenRouterHttpError) {
      if (error.timeout) return AiErrorCode.TIMEOUT;
      if (error.status === 401 || error.status === 403) return AiErrorCode.AUTH_FAILED;
      if (error.status === 404) return AiErrorCode.MODEL_NOT_FOUND;
      if (error.status === 429 || error.status === 402) return AiErrorCode.RATE_LIMITED;
    }
    return AiErrorCode.PROVIDER_ERROR;
  }
}
