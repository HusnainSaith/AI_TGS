import * as Joi from 'joi';

export const envSchema = Joi.object({
  APP_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string()
    .pattern(/^[a-z0-9/-]+$/)
    .default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000'),
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().default('tgs'),
  DATABASE_USER: Joi.string().default('tgs'),
  DATABASE_PASSWORD: Joi.string()
    .when('APP_ENV', { is: 'production', then: Joi.required() })
    .default('tgs_dev_only'),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  STORAGE_PROVIDER: Joi.string().valid('local').default('local'),
  STORAGE_LOCAL_ROOT: Joi.string().min(1).default('./storage'),
  KB_MAX_FILE_SIZE_MB: Joi.number().positive().max(100).default(20),
  KB_ALLOWED_MIME_TYPES: Joi.string()
    .min(1)
    .default(
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
    ),
  KB_CHUNK_TARGET_TOKENS: Joi.number().integer().min(50).max(4000).default(500),
  KB_CHUNK_MAX_TOKENS: Joi.number().integer().min(50).max(8000).default(750),
  KB_CHUNK_MIN_TOKENS: Joi.number().integer().min(1).max(2000).default(80),
  KB_CHUNK_OVERLAP_TOKENS: Joi.number().integer().min(0).max(1000).default(50),
  KB_PDF_MIN_TEXT_CHARS_PER_PAGE: Joi.number().integer().min(0).max(10000).default(30),
  KB_PDF_MAX_EMPTY_PAGE_RATIO: Joi.number().min(0).max(1).default(0.6),
  KB_INGESTION_STALE_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  KB_ALLOW_UNSCANNED_PROCESSING: Joi.boolean().truthy('true').falsy('false').default(false),
  OCR_PROVIDER: Joi.string().valid('none').default('none'),
  MALWARE_SCANNER_PROVIDER: Joi.string().valid('none', 'windows_defender').default('none'),
  WINDOWS_DEFENDER_MPCMDRUN_PATH: Joi.string().when('MALWARE_SCANNER_PROVIDER', {
    is: 'windows_defender',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  OBJECT_STORAGE_PROVIDER: Joi.string().allow('').default(''),
  OBJECT_STORAGE_BUCKET: Joi.string().allow('').default(''),
  OBJECT_STORAGE_REGION: Joi.string().allow('').default(''),
  OBJECT_STORAGE_ENDPOINT: Joi.string().allow('').default(''),
  AI_PROVIDER: Joi.string().valid('', 'openai', 'test').default('openai'),
  AI_MODEL: Joi.string().allow('').default(''),
  AI_API_KEY: Joi.string().allow('').default(''),
  AI_TEMPERATURE: Joi.number().min(0).max(2).default(0.2),
  AI_MAX_OUTPUT_TOKENS: Joi.number().integer().min(100).max(100000).default(4000),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(60000),
  AI_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(1),
  AI_MAX_QUESTIONS_PER_REQUEST: Joi.number().integer().min(1).max(500).default(100),
  AI_PROMPT_STRATEGY_VERSION: Joi.string().min(1).max(64).default('grounded-question-v1'),
  AI_STALE_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  USAGE_RESERVATION_TTL_MINUTES: Joi.number().integer().min(1).max(10080).default(30),
  PDF_RENDER_VERSION: Joi.string().min(1).max(64).default('test-pdf-v1'),
  PDF_MAX_FILE_SIZE_BYTES: Joi.number().integer().min(1024).max(52428800).default(10485760),
  PDF_MAX_QUESTIONS: Joi.number().integer().min(1).max(2000).default(500),
  TEST_EXPORT_STORAGE_PREFIX: Joi.string()
    .pattern(/^[a-z0-9/_-]+$/)
    .default('test-exports'),
  EMBEDDING_PROVIDER: Joi.string().valid('', 'openai', 'test').default('openai'),
  EMBEDDING_MODEL: Joi.string().allow('').default('text-embedding-3-small'),
  EMBEDDING_API_KEY: Joi.string().allow('').default(''),
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  EMBEDDING_BATCH_SIZE: Joi.number().integer().min(1).max(2048).default(32),
  EMBEDDING_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  EMBEDDING_STALE_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  RAG_TOP_K: Joi.number().integer().min(1).max(50).default(12),
  RAG_MAX_TOP_K: Joi.number().integer().min(1).max(50).default(50),
  RAG_MIN_SIMILARITY: Joi.number().min(0).max(1).default(0.35),
  RAG_VECTOR_WEIGHT: Joi.number().min(0).default(0.7),
  RAG_KEYWORD_WEIGHT: Joi.number().min(0).default(0.3),
  RAG_VECTOR_CANDIDATE_K: Joi.number().integer().min(1).max(500).default(40),
  RAG_KEYWORD_CANDIDATE_K: Joi.number().integer().min(1).max(500).default(40),
  RAG_CONTEXT_BUDGET_TOKENS: Joi.number().integer().min(100).max(50000).default(6000),
  RAG_RETRIEVAL_STRATEGY_VERSION: Joi.string().min(1).max(64).default('hybrid-v1'),
  EMAIL_PROVIDER: Joi.string().valid('', 'smtp').default(''),
  EMAIL_FROM: Joi.string().allow('').default(''),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM_EMAIL: Joi.string().email().allow('').default(''),
  SMTP_FROM_NAME: Joi.string().min(1).max(100).default('AI Test Generation'),
  SMTP_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(10000),
  SMTP_GREETING_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(10000),
  SMTP_SOCKET_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(30000),
  NOTIFICATION_WORKER_INTERVAL_MS: Joi.number().integer().min(1000).max(300000).default(5000),
  PAYMENT_PROVIDER: Joi.string().valid('', 'test', 'safepay').default(''),
  PAYMENT_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  BILLING_SUCCESS_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000/billing/success'),
  BILLING_CANCEL_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000/billing/cancel'),
  BILLING_PORTAL_RETURN_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000/settings/billing'),
  SAFEPAY_ENVIRONMENT: Joi.string().valid('sandbox', 'production').default('sandbox'),
  SAFEPAY_PUBLIC_KEY: Joi.string().allow('').default(''),
  SAFEPAY_SECRET_KEY: Joi.string().allow('').default(''),
  SAFEPAY_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SAFEPAY_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(15000),
}).custom((value: Record<string, unknown>, helpers) => {
  const min = Number(value.KB_CHUNK_MIN_TOKENS);
  const target = Number(value.KB_CHUNK_TARGET_TOKENS);
  const max = Number(value.KB_CHUNK_MAX_TOKENS);
  const overlap = Number(value.KB_CHUNK_OVERLAP_TOKENS);
  if (!(min <= target && target <= max && overlap < target))
    return helpers.error('any.invalid', {
      message: 'Chunk settings require min <= target <= max and overlap < target',
    });
  if (value.APP_ENV === 'production' && value.KB_ALLOW_UNSCANNED_PROCESSING === true)
    return helpers.error('any.invalid', {
      message: 'Production cannot allow unscanned ingestion processing',
    });
  if (value.APP_ENV === 'production' && value.EMBEDDING_PROVIDER === 'test')
    return helpers.error('any.invalid', {
      message: 'The deterministic test embedding provider is forbidden in production',
    });
  if (value.APP_ENV === 'production' && value.AI_PROVIDER === 'test')
    return helpers.error('any.invalid', {
      message: 'The deterministic test AI provider is forbidden in production',
    });
  if (value.APP_ENV === 'production' && value.PAYMENT_PROVIDER === 'test')
    return helpers.error('any.invalid', {
      message: 'The deterministic test payment provider is forbidden in production',
    });
  if (
    value.EMAIL_PROVIDER === 'smtp' &&
    (!value.SMTP_HOST || !value.SMTP_FROM_EMAIL || (value.SMTP_USER && !value.SMTP_PASSWORD))
  )
    return helpers.error('any.invalid', {
      message: 'SMTP requires host, from email, and password when a user is configured',
    });
  if (value.APP_ENV === 'production' && value.EMAIL_PROVIDER !== 'smtp')
    return helpers.error('any.invalid', {
      message: 'Production requires EMAIL_PROVIDER=smtp for critical account emails',
    });
  if (Number(value.SMTP_PORT) === 465 && value.SMTP_SECURE !== true)
    return helpers.error('any.invalid', { message: 'SMTP port 465 requires SMTP_SECURE=true' });
  if (
    value.APP_ENV === 'production' &&
    value.PAYMENT_PROVIDER === 'safepay' &&
    (!value.SAFEPAY_PUBLIC_KEY || !value.SAFEPAY_SECRET_KEY || !value.SAFEPAY_WEBHOOK_SECRET)
  )
    return helpers.error('any.invalid', {
      message: 'Safepay requires public, secret, and webhook keys',
    });
  if (value.EMBEDDING_PROVIDER === 'openai' && value.EMBEDDING_MODEL !== 'text-embedding-3-small')
    return helpers.error('any.invalid', {
      message: 'The active MVP OpenAI embedding model must be text-embedding-3-small',
    });
  if (Number(value.RAG_VECTOR_WEIGHT) + Number(value.RAG_KEYWORD_WEIGHT) <= 0)
    return helpers.error('any.invalid', { message: 'Retrieval weights cannot both be zero' });
  if (Number(value.RAG_TOP_K) > Number(value.RAG_MAX_TOP_K))
    return helpers.error('any.invalid', { message: 'RAG_TOP_K cannot exceed RAG_MAX_TOP_K' });
  return value;
});
