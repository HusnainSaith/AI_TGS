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
  MALWARE_SCANNER_PROVIDER: Joi.string().valid('none').default('none'),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  OBJECT_STORAGE_PROVIDER: Joi.string().allow('').default(''),
  OBJECT_STORAGE_BUCKET: Joi.string().allow('').default(''),
  OBJECT_STORAGE_REGION: Joi.string().allow('').default(''),
  OBJECT_STORAGE_ENDPOINT: Joi.string().allow('').default(''),
  AI_PROVIDER: Joi.string().allow('').default(''),
  AI_MODEL: Joi.string().allow('').default(''),
  AI_API_KEY: Joi.string().allow('').default(''),
  EMBEDDING_PROVIDER: Joi.string().allow('').default(''),
  EMBEDDING_MODEL: Joi.string().allow('').default(''),
  EMBEDDING_API_KEY: Joi.string().allow('').default(''),
  EMAIL_PROVIDER: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().allow('').default(''),
  PAYMENT_PROVIDER: Joi.string().allow('').default(''),
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
  return value;
});
