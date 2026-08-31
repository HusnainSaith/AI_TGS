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
  it('validates malware provider configuration and production override', () => {
    const base = { JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) };
    expect(envSchema.validate({ ...base, MALWARE_SCANNER_PROVIDER: 'none' }).error).toBeUndefined();
    expect(envSchema.validate({ ...base, MALWARE_SCANNER_PROVIDER: 'clamav' }).error).toBeDefined();
    expect(
      envSchema.validate({ ...base, MALWARE_SCANNER_PROVIDER: 'windows_defender' }).error,
    ).toBeDefined();
    expect(
      envSchema.validate({
        ...base,
        MALWARE_SCANNER_PROVIDER: 'windows_defender',
        WINDOWS_DEFENDER_MPCMDRUN_PATH: 'C:\\Defender\\MpCmdRun.exe',
      }).error,
    ).toBeUndefined();
    expect(
      envSchema.validate({
        ...base,
        APP_ENV: 'production',
        DATABASE_PASSWORD: 'secret',
        KB_ALLOW_UNSCANNED_PROCESSING: true,
      }).error,
    ).toBeDefined();
  });
  it('validates hybrid retrieval weights and bounded topK', () => {
    const base = { JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) };
    expect(
      envSchema.validate({ ...base, RAG_VECTOR_WEIGHT: 0, RAG_KEYWORD_WEIGHT: 0 }).error,
    ).toBeDefined();
    expect(envSchema.validate({ ...base, RAG_TOP_K: 20, RAG_MAX_TOP_K: 10 }).error).toBeDefined();
    expect(
      envSchema.validate({ ...base, RAG_VECTOR_WEIGHT: 0.7, RAG_KEYWORD_WEIGHT: 0.3 }).error,
    ).toBeUndefined();
  });
});
