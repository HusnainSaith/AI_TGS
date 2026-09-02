import { ConfigService } from '@nestjs/config';
import { createAiGenerationProvider } from './ai-generation.module';
import { OpenRouterAiGenerationProvider } from './openrouter-generation.provider';
import { createEmbeddingProvider } from '../embeddings/embeddings.module';
import { EmbeddingConfigService } from '../embeddings/embedding-config.service';
import { OpenRouterEmbeddingProvider } from '../embeddings/openrouter-embedding.provider';

describe('OpenRouter provider selection', () => {
  it('selects explicit OpenRouter generation and embedding providers', () => {
    const config = new ConfigService({
      aiGeneration: { provider: 'openrouter' },
      embedding: { provider: 'openrouter' },
    });
    expect(createAiGenerationProvider(config)).toBeInstanceOf(OpenRouterAiGenerationProvider);
    expect(createEmbeddingProvider(new EmbeddingConfigService(config), config)).toBeInstanceOf(
      OpenRouterEmbeddingProvider,
    );
  });
});
