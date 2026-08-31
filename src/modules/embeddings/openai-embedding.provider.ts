import { Injectable } from '@nestjs/common';
import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';
import {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingResult,
} from '../../infrastructure/providers/provider.contracts';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingErrorCode } from './embedding.enums';
import { EmbeddingProviderError } from './embedding-provider.error';

@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'openai';
  constructor(private readonly config: EmbeddingConfigService) {}
  getModelInfo(): EmbeddingModelInfo {
    const active = this.config.active();
    return { provider: this.providerName, model: active.model, dimension: active.dimension };
  }
  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    if (!results[0])
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.RESPONSE_MISMATCH,
        'The provider returned no embedding',
      );
    return results[0];
  }
  async embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
    if (!texts.length) return [];
    if (texts.some((text) => !text.trim()))
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.INPUT_TOO_LARGE,
        'Embedding input must not be empty',
      );
    const apiKey = this.config.apiKey();
    if (!apiKey)
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.PROVIDER_NOT_CONFIGURED,
        'OpenAI embedding provider is not configured',
      );
    const model = this.getModelInfo();
    const started = Date.now();
    try {
      const client = new OpenAI({ apiKey, timeout: this.config.timeoutMs(), maxRetries: 2 });
      const response = await client.embeddings.create({
        model: model.model,
        input: [...texts],
        encoding_format: 'float',
      });
      if (response.data.length !== texts.length)
        throw new EmbeddingProviderError(
          EmbeddingErrorCode.RESPONSE_MISMATCH,
          'Embedding provider response count mismatch',
        );
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      return ordered.map((item) => {
        if (item.embedding.length !== model.dimension)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.DIMENSION_MISMATCH,
            'Embedding provider response dimension mismatch',
          );
        return {
          ...model,
          vector: item.embedding,
          usage: {
            inputTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          },
          providerRequestId: response._request_id ?? undefined,
          latencyMs: Date.now() - started,
        };
      });
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      if (error instanceof APIConnectionTimeoutError)
        throw new EmbeddingProviderError(
          EmbeddingErrorCode.TIMEOUT,
          'Embedding request timed out',
          true,
        );
      if (error instanceof APIError) {
        if (error.status === 401 || error.status === 403)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.AUTH_FAILED,
            'Embedding authentication failed',
          );
        if (error.status === 429)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.RATE_LIMITED,
            'Embedding provider rate limited the request',
            true,
          );
        if (error.status === 404)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.MODEL_NOT_FOUND,
            'Embedding model was not found',
          );
        if (error.status === 400)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.INPUT_TOO_LARGE,
            'Embedding input was rejected',
          );
      }
      throw new EmbeddingProviderError(
        EmbeddingErrorCode.PROVIDER_ERROR,
        'Embedding provider request failed',
        true,
      );
    }
  }
}
