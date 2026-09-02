import { ConfigService } from '@nestjs/config';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingErrorCode } from './embedding.enums';
import { OpenRouterEmbeddingProvider } from './openrouter-embedding.provider';

describe('OpenRouterEmbeddingProvider', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const provider = (timeoutMs = 1000) => {
    const config = new ConfigService({
      embedding: {
        provider: 'openrouter',
        model: 'openai/text-embedding-3-small',
        dimension: 1536,
        distanceMetric: 'cosine',
        preprocessingVersion: 'test-v1',
        timeoutMs,
      },
      openRouter: {
        apiKey: 'test-openrouter-key',
        baseUrl: 'https://openrouter.example/api/v1',
      },
    });
    return new OpenRouterEmbeddingProvider(new EmbeddingConfigService(config), config);
  };

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('requests and validates a finite 1536-dimensional vector', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ index: 0, embedding: Array(1536).fill(0.01) }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const result = await provider().embed('connectivity check');
    expect(result).toMatchObject({
      provider: 'openrouter',
      model: 'openai/text-embedding-3-small',
      dimension: 1536,
      usage: { totalTokens: 3 },
    });
    expect(result.vector).toHaveLength(1536);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.example/api/v1/embeddings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-openrouter-key' }),
      }),
    );
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      model: 'openai/text-embedding-3-small',
      dimensions: 1536,
      input: ['connectivity check'],
    });
  });

  it('rejects missing, incorrectly sized, and non-finite vectors', async () => {
    for (const [embedding, code] of [
      [undefined, EmbeddingErrorCode.DIMENSION_MISMATCH],
      [[0.1], EmbeddingErrorCode.DIMENSION_MISMATCH],
      [[...Array(1535).fill(0.1), Number.NaN], EmbeddingErrorCode.RESPONSE_MISMATCH],
    ] as const) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [{ index: 0, embedding }] }),
      });
      await expect(provider().embed('test')).rejects.toMatchObject({ code });
    }
  });

  it.each([
    [401, EmbeddingErrorCode.AUTH_FAILED],
    [403, EmbeddingErrorCode.AUTH_FAILED],
    [404, EmbeddingErrorCode.MODEL_NOT_FOUND],
    [429, EmbeddingErrorCode.RATE_LIMITED],
    [500, EmbeddingErrorCode.PROVIDER_ERROR],
  ])('maps HTTP %i safely', async (status, code) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(provider().embed('test')).rejects.toMatchObject({ code });
  });

  it('rejects empty response data', async () => {
    fetchMock.mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    await expect(provider().embed('test')).rejects.toMatchObject({
      code: EmbeddingErrorCode.RESPONSE_MISMATCH,
    });
  });

  it('maps abort to timeout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    );
    await expect(provider(1).embed('test')).rejects.toMatchObject({
      code: EmbeddingErrorCode.TIMEOUT,
    });
  });
});
