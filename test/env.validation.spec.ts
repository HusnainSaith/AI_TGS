import { envSchema } from '../src/config/env.validation';
describe('environment validation', () => {
  it('rejects short JWT secrets', () => {
    const result = envSchema.validate({
      JWT_ACCESS_SECRET: 'short',
      JWT_REFRESH_SECRET: 'also-short',
    });
    expect(result.error).toBeDefined();
  });
  it('accepts local defaults with secure secrets', () => {
    const result = envSchema.validate({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
    });
    expect(result.error).toBeUndefined();
    expect(result.value.API_PREFIX).toBe('api/v1');
    expect(result.value.STORAGE_PROVIDER).toBe('local');
    expect(result.value.KB_MAX_FILE_SIZE_MB).toBe(20);
  });
  it('rejects unsafe storage providers and excessive upload limits', () => {
    expect(
      envSchema.validate({
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        STORAGE_PROVIDER: 'unknown',
      }).error,
    ).toBeDefined();
    expect(
      envSchema.validate({
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        KB_MAX_FILE_SIZE_MB: 1000,
      }).error,
    ).toBeDefined();
  });
});
