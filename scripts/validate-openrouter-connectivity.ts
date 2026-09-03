import 'dotenv/config';
import { ProviderCallCounter, requireRealAiOptIn, safeError } from './ai-validation-safety';

async function main() {
  requireRealAiOptIn(process.env);
  const counter = new ProviderCallCounter({ generation: 1, embedding: 1 });
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(
    /\/$/,
    '',
  );
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!}`,
    'Content-Type': 'application/json',
  };
  counter.take('generation');
  const generationStarted = Date.now();
  const generationResponse = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{ role: 'user', content: 'Return JSON with answer set to ready.' }],
      temperature: 0,
      max_tokens: 1024,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'connectivity',
          strict: true,
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
        },
      },
      stream: false,
      reasoning: { exclude: true },
      provider: { require_parameters: true },
    }),
  });
  const generation = (await generationResponse.json()) as {
    model?: string;
    provider?: string;
    choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const choice = generation.choices?.[0];
  let generationValid = false;
  if (
    generationResponse.ok &&
    choice?.finish_reason === 'stop' &&
    typeof choice.message?.content === 'string'
  )
    try {
      const parsed = JSON.parse(choice.message.content) as Record<string, unknown>;
      generationValid = typeof parsed.answer === 'string';
    } catch {
      generationValid = false;
    }
  if (!generationValid)
    throw new Error(`OpenRouter generation connectivity failed (${generationResponse.status})`);
  counter.take('embedding');
  const embeddingStarted = Date.now();
  const embeddingResponse = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL,
      input: ['connectivity check'],
      encoding_format: 'float',
    }),
  });
  const embedding = (await embeddingResponse.json()) as {
    data?: Array<{ embedding?: unknown[] }>;
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };
  const dimension = embedding.data?.[0]?.embedding?.length ?? 0;
  if (!embeddingResponse.ok || dimension !== 1536)
    throw new Error(`OpenRouter embedding connectivity failed (${embeddingResponse.status})`);
  const calls = counter.snapshot();
  process.stdout.write(
    `${JSON.stringify({ success: true, level: 'connectivity', provider: 'openrouter', generationModel: process.env.AI_MODEL, embeddingModel: process.env.EMBEDDING_MODEL, checks: { REAL_OPENROUTER_GENERATION_CONNECTIVITY_VALIDATED: true, REAL_OPENROUTER_EMBEDDING_CONNECTIVITY_VALIDATED: true }, generation: { httpStatus: generationResponse.status, returnedModel: generation.model ?? null, routedProvider: generation.provider ?? null, finishReason: choice?.finish_reason ?? null, latencyMs: Date.now() - generationStarted, promptTokens: generation.usage?.prompt_tokens ?? null, completionTokens: generation.usage?.completion_tokens ?? null, totalTokens: generation.usage?.total_tokens ?? null }, embedding: { httpStatus: embeddingResponse.status, dimension, latencyMs: Date.now() - embeddingStarted }, generationCalls: calls.generation, embeddingCalls: calls.embedding })}\n`,
  );
}
void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ success: false, error: safeError(error) })}\n`);
  process.exitCode = 1;
});
