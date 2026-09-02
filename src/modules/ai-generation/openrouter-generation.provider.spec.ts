import { ConfigService } from '@nestjs/config';
import { AiErrorCode } from './generation.enums';
import { OpenRouterAiGenerationProvider } from './openrouter-generation.provider';

describe('OpenRouterAiGenerationProvider', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const prompt = {
    system: 'Use evidence only',
    user: 'Evidence: plants use light',
    schema: { type: 'object', properties: { questions: { type: 'array' } } },
  };

  const provider = (timeoutMs = 1000) =>
    new OpenRouterAiGenerationProvider(
      new ConfigService({
        aiGeneration: {
          model: 'google/gemini-3.8-flash',
          timeoutMs,
          maxRetries: 0,
          maxOutputTokens: 100,
          temperature: 0.2,
        },
        openRouter: {
          apiKey: 'test-openrouter-key',
          baseUrl: 'https://openrouter.example/api/v1',
          httpReferer: 'https://app.example',
          appName: 'TGS',
        },
      }),
    );

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends the selected model, authentication, metadata, and strict schema', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"questions":[]}' } }],
          usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await provider().generateQuestions(prompt);
    expect(result).toMatchObject({ output: '{"questions":[]}', usage: { totalTokens: 6 } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.example/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-openrouter-key',
          'HTTP-Referer': 'https://app.example',
          'X-Title': 'TGS',
        }),
      }),
    );
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      model: 'google/gemini-3.8-flash',
      response_format: { type: 'json_schema', json_schema: { strict: true } },
      provider: { require_parameters: true },
    });
  });

  it.each([
    [401, AiErrorCode.AUTH_FAILED],
    [403, AiErrorCode.AUTH_FAILED],
    [404, AiErrorCode.MODEL_NOT_FOUND],
    [429, AiErrorCode.RATE_LIMITED],
    [500, AiErrorCode.PROVIDER_ERROR],
  ])('maps HTTP %i safely', async (status, code) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(provider().generateQuestions(prompt)).rejects.toThrow(code);
  });

  it('rejects a malformed successful response', async () => {
    fetchMock.mockResolvedValue(new Response('{"choices":[]}', { status: 200 }));
    await expect(provider().generateQuestions(prompt)).rejects.toThrow(
      AiErrorCode.INVALID_RESPONSE,
    );
  });

  it('maps an aborted request to timeout', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    await expect(provider(1).generateQuestions(prompt)).rejects.toThrow(AiErrorCode.TIMEOUT);
  });
});
