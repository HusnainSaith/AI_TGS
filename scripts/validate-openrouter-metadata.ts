import 'dotenv/config';
import { safeError } from './ai-validation-safety';

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(
    /\/$/,
    '',
  );
  const generationModel = process.env.AI_MODEL || '';
  const embeddingModel = process.env.EMBEDDING_MODEL || '';
  const headers = { Authorization: `Bearer ${apiKey}` };
  const get = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const [key, models, endpoints] = await Promise.all([
    get('/key'),
    get(`/models?q=${encodeURIComponent(generationModel)}`),
    get(`/models/${generationModel}/endpoints`),
  ]);
  const modelList = Array.isArray(models.body.data)
    ? (models.body.data as Array<Record<string, unknown>>)
    : [];
  const model = modelList.find((entry) => entry.id === generationModel);
  const endpointData = endpoints.body.data as Record<string, unknown> | undefined;
  const endpointList = Array.isArray(endpointData?.endpoints) ? endpointData.endpoints : [];
  const supported = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
  const result = {
    success:
      key.status === 200 &&
      models.status === 200 &&
      endpoints.status === 200 &&
      Boolean(model) &&
      endpointList.length > 0,
    level: 'metadata',
    provider: 'openrouter',
    generationModel,
    embeddingModel,
    checks: {
      authentication: key.status === 200,
      modelVisible: Boolean(model),
      canonicalSlug: model?.canonical_slug ?? null,
      endpointsAvailable: endpointList.length,
      structuredOutput:
        supported.includes('structured_outputs') && supported.includes('response_format'),
      reasoning: supported.includes('reasoning'),
      maxTokens: supported.includes('max_tokens'),
    },
    generationCalls: 0,
    embeddingCalls: 0,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.success) process.exitCode = 1;
}
void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ success: false, error: safeError(error) })}\n`);
  process.exitCode = 1;
});
