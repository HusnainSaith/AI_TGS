export type ValidationEnvironment = 'local' | 'staging' | 'ci-manual';

export function requireValidationEnvironment(env: NodeJS.ProcessEnv) {
  const value = env.VALIDATION_ENV;
  if (!['local', 'staging', 'ci-manual'].includes(value ?? ''))
    throw new Error('VALIDATION_ENV must be local, staging, or ci-manual');
  if (env.NODE_ENV === 'test' && value !== 'ci-manual')
    throw new Error('NODE_ENV=test requires VALIDATION_ENV=ci-manual');
  return value as ValidationEnvironment;
}

export function requireRealAiOptIn(env: NodeJS.ProcessEnv, requirePaidAcknowledgement = false) {
  requireValidationEnvironment(env);
  if (env.RUN_REAL_AI_VALIDATION !== 'true')
    throw new Error('Real AI validation is disabled. Set RUN_REAL_AI_VALIDATION=true explicitly.');
  if (requirePaidAcknowledgement && env.ALLOW_PAID_AI_CALLS !== 'true')
    throw new Error('Full AI validation requires ALLOW_PAID_AI_CALLS=true explicitly.');
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');
}

export class ProviderCallCounter {
  private counts = { generation: 0, embedding: 0 };
  constructor(private readonly limits: { generation: number; embedding: number }) {}

  take(type: 'generation' | 'embedding') {
    if (this.counts[type] >= this.limits[type])
      throw new Error(`${type} validation call limit exceeded`);
    this.counts[type] += 1;
  }

  snapshot() {
    return { ...this.counts };
  }
}

export function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown validation error';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/sk-or-[A-Za-z0-9_-]+/g, '[REDACTED]');
}
