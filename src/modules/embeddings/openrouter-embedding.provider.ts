import { ConfigService } from '@nestjs/config';
import {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingResult,
} from '../../infrastructure/providers/provider.contracts';
import {
  OpenRouterHttpConfig,
  OpenRouterHttpError,
  postOpenRouter,
} from '../../infrastructure/providers/openrouter-http';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingErrorCode } from './embedding.enums';
import { EmbeddingProviderError } from './embedding-provider.error';

interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'openrouter';
  constructor(
    private readonly embeddingConfig: EmbeddingConfigService,
    private readonly config: ConfigService,
  ) {}

  getModelInfo(): EmbeddingModelInfo {
    const active = this.embeddingConfig.active();
    return { provider: this.providerName, model: active.model, dimension: active.dimension };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    if (!results[0]) throw this.responseError();
    return results[0];
  }

  async embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
    if (!texts.length) return [];
    if (texts.some((text) => !text.trim()))
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.INPUT_TOO_LARGE,
        'Embedding input is empty',
      );
    const model = this.getModelInfo();
    const http = this.httpConfig();
    if (!http.apiKey)
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.PROVIDER_NOT_CONFIGURED,
        'OpenRouter embedding provider is not configured',
      );
    const started = Date.now();
    try {
      const response = (await postOpenRouter(http, '/embeddings', {
        model: model.model,
        input: [...texts],
        dimensions: model.dimension,
        encoding_format: 'float',
      })) as EmbeddingResponse;
      if (!Array.isArray(response.data) || response.data.length !== texts.length)
        throw this.responseError();
      const ordered = [...response.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return ordered.map((item) => {
        if (!Array.isArray(item.embedding) || item.embedding.length !== model.dimension)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.DIMENSION_MISMATCH,
            'Embedding provider response dimension mismatch',
          );
        if (item.embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value)))
          throw this.responseError();
        return {
          ...model,
          vector: item.embedding as number[],
          usage: {
            inputTokens: response.usage?.prompt_tokens,
            totalTokens: response.usage?.total_tokens,
          },
          latencyMs: Date.now() - started,
        };
      });
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      if (error instanceof OpenRouterHttpError) {
        if (error.timeout)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.TIMEOUT,
            'Embedding request timed out',
            true,
          );
        if (error.status === 401 || error.status === 403)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.AUTH_FAILED,
            'Embedding authentication failed',
          );
        if (error.status === 404)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.MODEL_NOT_FOUND,
            'Embedding model was not found',
          );
        if (error.status === 429 || error.status === 402)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.RATE_LIMITED,
            'Embedding request was limited',
            true,
          );
      }
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.PROVIDER_ERROR,
        'Embedding provider request failed',
        true,
      );
    }
  }

  private httpConfig(): OpenRouterHttpConfig {
    return {
      apiKey: this.config.get<string>('openRouter.apiKey') ?? '',
      baseUrl: this.config.get<string>('openRouter.baseUrl') ?? 'https://openrouter.ai/api/v1',
      httpReferer: this.config.get<string>('openRouter.httpReferer') || undefined,
      appName: this.config.get<string>('openRouter.appName') || undefined,
      timeoutMs: this.embeddingConfig.timeoutMs(),
    };
  }

  private responseError() {
    return new EmbeddingProviderError(
      EmbeddingErrorCode.RESPONSE_MISMATCH,
      'Embedding provider response mismatch',
    );
  }
}
