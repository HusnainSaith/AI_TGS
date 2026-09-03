import {
  ProviderCallCounter,
  requireRealAiOptIn,
  requireValidationEnvironment,
  safeError,
} from '../scripts/ai-validation-safety';

describe('real AI validation safety', () => {
  const enabled = {
    VALIDATION_ENV: 'local',
    RUN_REAL_AI_VALIDATION: 'true',
    OPENROUTER_API_KEY: 'configured',
  } as NodeJS.ProcessEnv;
  it('rejects missing and invalid validation environments', () => {
    expect(() => requireValidationEnvironment({})).toThrow('VALIDATION_ENV');
    expect(() => requireValidationEnvironment({ VALIDATION_ENV: 'production' })).toThrow(
      'VALIDATION_ENV',
    );
  });
  it('rejects test mode except explicitly manual CI', () => {
    expect(() =>
      requireValidationEnvironment({ VALIDATION_ENV: 'local', NODE_ENV: 'test' }),
    ).toThrow('ci-manual');
    expect(requireValidationEnvironment({ VALIDATION_ENV: 'ci-manual', NODE_ENV: 'test' })).toBe(
      'ci-manual',
    );
  });
  it('requires exact real-AI and paid acknowledgements', () => {
    expect(() => requireRealAiOptIn({ ...enabled, RUN_REAL_AI_VALIDATION: 'TRUE' })).toThrow(
      'disabled',
    );
    expect(() => requireRealAiOptIn(enabled, true)).toThrow('ALLOW_PAID_AI_CALLS');
    expect(() =>
      requireRealAiOptIn({ ...enabled, ALLOW_PAID_AI_CALLS: 'true' }, true),
    ).not.toThrow();
  });
  it('requires a configured key without exposing it', () => {
    expect(() =>
      requireRealAiOptIn({ VALIDATION_ENV: 'local', RUN_REAL_AI_VALIDATION: 'true' }),
    ).toThrow('OPENROUTER_API_KEY');
  });
  it('enforces hard provider call limits', () => {
    const counter = new ProviderCallCounter({ generation: 1, embedding: 1 });
    counter.take('generation');
    counter.take('embedding');
    expect(counter.snapshot()).toEqual({ generation: 1, embedding: 1 });
    expect(() => counter.take('generation')).toThrow('limit exceeded');
    expect(() => counter.take('embedding')).toThrow('limit exceeded');
  });
  it('redacts API keys and bearer values from errors', () => {
    const output = safeError(new Error('Bearer secret sk-or-v1-secret'));
    expect(output).toBe('Bearer [REDACTED] [REDACTED]');
    expect(output).not.toContain('secret');
  });
});
