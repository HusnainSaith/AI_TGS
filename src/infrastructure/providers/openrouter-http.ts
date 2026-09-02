export interface OpenRouterHttpConfig {
  apiKey: string;
  baseUrl: string;
  httpReferer?: string;
  appName?: string;
  timeoutMs: number;
}

export class OpenRouterHttpError extends Error {
  constructor(
    readonly status: number | null,
    readonly timeout = false,
  ) {
    super(timeout ? 'OpenRouter request timed out' : 'OpenRouter request failed');
  }
}

export async function postOpenRouter(
  config: OpenRouterHttpConfig,
  path: string,
  body: Record<string, unknown>,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.httpReferer && { 'HTTP-Referer': config.httpReferer }),
        ...(config.appName && { 'X-Title': config.appName }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new OpenRouterHttpError(response.status);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new OpenRouterHttpError(response.status);
    }
  } catch (error) {
    if (error instanceof OpenRouterHttpError) throw error;
    if (controller.signal.aborted) throw new OpenRouterHttpError(null, true);
    throw new OpenRouterHttpError(null);
  } finally {
    clearTimeout(timer);
  }
}
