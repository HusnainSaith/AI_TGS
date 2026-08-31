import { createHash } from 'node:crypto';
import {
  EmbeddingModelInfo,
  EmbeddingProvider,
  EmbeddingResult,
} from '../../infrastructure/providers/provider.contracts';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingErrorCode } from './embedding.enums';
import { EmbeddingProviderError } from './embedding-provider.error';

export class DeterministicTestEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'test';
  constructor(private readonly config: EmbeddingConfigService) {
    if ((process.env.APP_ENV ?? 'development') === 'production')
      throw new Error('The deterministic test embedding provider is forbidden in production');
  }
  getModelInfo(): EmbeddingModelInfo {
    const active = this.config.active();
    return { provider: 'test', model: active.model, dimension: active.dimension };
  }
  embed(text: string) {
    return this.embedBatch([text]).then((items) => {
      if (!items[0]) throw new Error('Deterministic provider returned no result');
      return items[0];
    });
  }
  embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]> {
    if (texts.some((text) => text.includes('[TEST_FAIL]')))
      return Promise.reject(
        new EmbeddingProviderError(
          EmbeddingErrorCode.PROVIDER_ERROR,
          'Simulated test failure',
          true,
        ),
      );
    const info = this.getModelInfo();
    return Promise.resolve(
      texts.map((text) => {
        const vector = Array.from({ length: info.dimension }, () => 0);
        const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        for (const token of tokens) {
          const digest = createHash('sha256').update(token).digest();
          for (let index = 0; index < 8; index++) {
            const position = ((digest[index * 2]! << 8) | digest[index * 2 + 1]!) % info.dimension;
            vector[position]! += digest[16 + index]! % 2 === 0 ? 1 : -1;
          }
        }
        const norm = Math.hypot(...vector);
        return {
          ...info,
          vector: vector.map((value) => value / (norm || 1)),
          latencyMs: 0,
        };
      }),
    );
  }
}
