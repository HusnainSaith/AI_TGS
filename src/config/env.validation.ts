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
  DATABASE_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),
  DATABASE_IDLE_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(10000),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .allow('')
    .default(''),
  REDIS_USERNAME: Joi.string().allow('').default(''),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_TLS: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  QUEUES_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  QUEUE_PREFIX: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('tgs'),
  QUEUE_ATTEMPTS: Joi.number().integer().min(1).max(10).default(3),
  QUEUE_BACKOFF_MS: Joi.number().integer().min(100).max(60000).default(1000),
  QUEUE_RECONCILIATION_INTERVAL_MS: Joi.number().integer().min(5000).max(3600000).default(30000),
  WORKER_SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(30000),
  WORKER_INGESTION_CONCURRENCY: Joi.number().integer().min(1).max(32).default(2),
  WORKER_EMBEDDING_CONCURRENCY: Joi.number().integer().min(1).max(32).default(2),
  WORKER_AI_GENERATION_CONCURRENCY: Joi.number().integer().min(1).max(8).default(1),
  WORKER_PDF_CONCURRENCY: Joi.number().integer().min(1).max(32).default(2),
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
  KB_MAX_EXTRACTED_CHARACTERS: Joi.number().integer().min(1000).max(50000000).default(5000000),
  KB_MAX_PDF_PAGES: Joi.number().integer().min(1).max(10000).default(1000),
  KB_MAX_CHUNKS: Joi.number().integer().min(1).max(100000).default(10000),
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
  AI_PROVIDER: Joi.string().valid('', 'openai', 'openrouter', 'test').default('openai'),
  AI_MODEL: Joi.string().allow('').default(''),
  AI_API_KEY: Joi.string().allow('').default(''),
  AI_TEMPERATURE: Joi.number().min(0).max(2).default(0.2),
  AI_MAX_OUTPUT_TOKENS: Joi.number().integer().min(100).max(16384).default(4000),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).max(300000).default(60000),
  AI_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(1),
  AI_MAX_ITEM_REGEN_ATTEMPTS: Joi.number().integer().min(0).max(3).default(2),
  AI_MAX_QUESTIONS_PER_REQUEST: Joi.number().integer().min(1).max(500).default(100),
  AI_PROMPT_STRATEGY_VERSION: Joi.string().min(1).max(64).default('grounded-question-v1'),
  AI_STALE_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  AI_DUPLICATE_TEXT_THRESHOLD: Joi.number().min(0.5).max(1).default(0.85),
  AI_DUPLICATE_EMBEDDING_THRESHOLD: Joi.number().min(0.5).max(1).default(0.92),
  AI_DUPLICATE_CANDIDATE_LIMIT: Joi.number().integer().min(1).max(5000).default(500),
  USAGE_RESERVATION_TTL_MINUTES: Joi.number().integer().min(1).max(10080).default(30),
  PDF_RENDER_VERSION: Joi.string().min(1).max(64).default('test-pdf-v2-sections'),
  PDF_MAX_FILE_SIZE_BYTES: Joi.number().integer().min(1024).max(52428800).default(10485760),
  PDF_MAX_QUESTIONS: Joi.number().integer().min(1).max(2000).default(500),
  TEST_EXPORT_STORAGE_PREFIX: Joi.string()
    .pattern(/^[a-z0-9/_-]+$/)
    .default('test-exports'),
  EMBEDDING_PROVIDER: Joi.string().valid('', 'openai', 'openrouter', 'test').default('openai'),
  EMBEDDING_MODEL: Joi.string().allow('').default('text-embedding-3-small'),
  EMBEDDING_API_KEY: Joi.string().allow('').default(''),
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://openrouter.ai/api/v1'),
  OPENROUTER_HTTP_REFERER: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  OPENROUTER_APP_NAME: Joi.string().min(1).max(120).default('AI Test Generation System'),
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
  EMAIL_TOKEN_ENCRYPTION_KEY: Joi.string()
    .allow('')
    .pattern(/^[A-Za-z0-9+/]{43}=$/)
    .default(''),
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
  if (value.APP_ENV === 'production' && value.QUEUES_ENABLED !== true)
    return helpers.error('any.invalid', {
      message: 'Production requires QUEUES_ENABLED=true for asynchronous workloads',
    });
  if (value.APP_ENV === 'production' && value.EMBEDDING_PROVIDER === 'test')
    return helpers.error('any.invalid', {
      message: 'The deterministic test embedding provider is forbidden in production',
    });
  if (value.APP_ENV === 'production' && value.AI_PROVIDER === 'test')
    return helpers.error('any.invalid', {
      message: 'The deterministic test AI provider is forbidden in production',
    });
  if (
    value.APP_ENV === 'production' &&
    (!['openai', 'openrouter'].includes(String(value.AI_PROVIDER)) ||
      !value.AI_MODEL ||
      (value.AI_PROVIDER === 'openai' && !value.OPENAI_API_KEY))
  )
    return helpers.error('any.invalid', {
      message: 'Production requires a configured real AI generation provider and model',
    });
  if (
    value.APP_ENV === 'production' &&
    (!['openai', 'openrouter'].includes(String(value.EMBEDDING_PROVIDER)) ||
      (value.EMBEDDING_PROVIDER === 'openai' && !value.OPENAI_API_KEY && !value.EMBEDDING_API_KEY))
  )
    return helpers.error('any.invalid', {
      message: 'Production requires a configured real embedding provider',
    });
  if (
    (value.AI_PROVIDER === 'openrouter' || value.EMBEDDING_PROVIDER === 'openrouter') &&
    !value.OPENROUTER_API_KEY
  )
    return helpers.error('any.invalid', {
      message: 'OpenRouter providers require OPENROUTER_API_KEY',
    });
  const corsOrigins = (typeof value.CORS_ORIGINS === 'string' ? value.CORS_ORIGINS : '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*'))
    return helpers.error('any.invalid', {
      message: 'Wildcard CORS origins are forbidden when credentials are enabled',
    });
  if (
    value.APP_ENV === 'production' &&
    (!corsOrigins.length ||
      corsOrigins.some((origin) => !origin.startsWith('https://') || origin.includes('localhost')))
  )
    return helpers.error('any.invalid', {
      message: 'Production CORS origins must be explicit HTTPS origins',
    });
  if (
    value.APP_ENV === 'production' &&
    (typeof value.FRONTEND_URL !== 'string' || !value.FRONTEND_URL.startsWith('https://'))
  )
    return helpers.error('any.invalid', {
      message: 'Production FRONTEND_URL must use HTTPS',
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
  if (
    typeof value.EMAIL_TOKEN_ENCRYPTION_KEY === 'string' &&
    value.EMAIL_TOKEN_ENCRYPTION_KEY &&
    Buffer.from(value.EMAIL_TOKEN_ENCRYPTION_KEY, 'base64').length !== 32
  )
    return helpers.error('any.invalid', {
      message: 'EMAIL_TOKEN_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes',
    });
  if (value.APP_ENV === 'production' && !value.EMAIL_TOKEN_ENCRYPTION_KEY)
    return helpers.error('any.invalid', {
      message: 'Production requires a dedicated EMAIL_TOKEN_ENCRYPTION_KEY',
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
  if (
    value.EMBEDDING_PROVIDER === 'openrouter' &&
    value.EMBEDDING_MODEL !== 'openai/text-embedding-3-small'
  )
    return helpers.error('any.invalid', {
      message: 'The active OpenRouter embedding model must be openai/text-embedding-3-small',
    });
  if (Number(value.RAG_VECTOR_WEIGHT) + Number(value.RAG_KEYWORD_WEIGHT) <= 0)
    return helpers.error('any.invalid', { message: 'Retrieval weights cannot both be zero' });
  if (Number(value.RAG_TOP_K) > Number(value.RAG_MAX_TOP_K))
    return helpers.error('any.invalid', { message: 'RAG_TOP_K cannot exceed RAG_MAX_TOP_K' });
  return value;
});
