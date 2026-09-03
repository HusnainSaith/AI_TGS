import { ConfigService } from '@nestjs/config';
import { EmbeddingConfigService } from './embedding-config.service';
import { DeterministicTestEmbeddingProvider } from './deterministic-test-embedding.provider';
import { EmbeddingProviderError } from './embedding-provider.error';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider';
import { EmbeddingErrorCode } from './embedding.enums';

function config(values: Record<string, unknown>) {
  return new ConfigService(values);
}

describe('Embedding foundation', () => {
  it('creates a stable semantic config version for the verified default model', () => {
    const service = new EmbeddingConfigService(
      config({
        embedding: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          dimension: 1536,
          distanceMetric: 'cosine',
          preprocessingVersion: 'normalized-chunk-v1',
          apiKey: '',
        },
      }),
    );
    expect(service.active()).toMatchObject({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 1536,
      distanceMetric: 'cosine',
      configured: false,
    });
    expect(service.active().configVersion).toBe(service.active().configVersion);
  });

  it('fails safely when an OpenAI key is missing', async () => {
    const service = new EmbeddingConfigService(
      config({
        embedding: { provider: 'openai', model: 'text-embedding-3-small', dimension: 1536 },
      }),
    );
    await expect(new OpenAIEmbeddingProvider(service).embed('test')).rejects.toMatchObject({
      code: EmbeddingErrorCode.PROVIDER_NOT_CONFIGURED,
    } satisfies Partial<EmbeddingProviderError>);
  });

  it('recognizes a keyed OpenRouter embedding provider as configured', () => {
    const service = new EmbeddingConfigService(
      config({
        embedding: {
          provider: 'openrouter',
          model: 'openai/text-embedding-3-small',
          dimension: 1536,
          apiKey: 'test-openrouter-key',
        },
      }),
    );
    expect(service.active()).toMatchObject({ provider: 'openrouter', configured: true });
  });

  it('generates deterministic normalized vectors with the exact dimension', async () => {
    const service = new EmbeddingConfigService(
      config({ embedding: { provider: 'test', model: 'deterministic-test-v1', dimension: 1536 } }),
    );
    const provider = new DeterministicTestEmbeddingProvider(service);
    const [first, second] = await Promise.all([
      provider.embed('inertia'),
      provider.embed('inertia'),
    ]);
    expect(first.vector).toEqual(second.vector);
    expect(first.vector).toHaveLength(1536);
    expect(Math.hypot(...first.vector)).toBeCloseTo(1, 10);
  });

  it('supports deterministic batch output and simulated failures', async () => {
    const service = new EmbeddingConfigService(
      config({ embedding: { provider: 'test', model: 'deterministic-test-v1', dimension: 1536 } }),
    );
    const provider = new DeterministicTestEmbeddingProvider(service);
    await expect(provider.embedBatch(['one', 'two'])).resolves.toHaveLength(2);
    await expect(provider.embedBatch(['[TEST_FAIL]'])).rejects.toMatchObject({
      code: 'EMBEDDING_PROVIDER_ERROR',
      retryable: true,
    });
  });

  it('rejects the deterministic provider in production', () => {
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = 'production';
    const service = new EmbeddingConfigService(config({ embedding: { dimension: 1536 } }));
    expect(() => new DeterministicTestEmbeddingProvider(service)).toThrow('forbidden');
    process.env.APP_ENV = previous;
  });
});
