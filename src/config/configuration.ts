export const configuration = () => ({
  app: {
    env: process.env.APP_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    prefix: process.env.API_PREFIX ?? 'api/v1',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    swagger: process.env.SWAGGER_ENABLED !== 'false',
    trustProxy: process.env.TRUST_PROXY === 'true',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  },
  database: {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    name: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true',
    poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMs: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMs: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10000),
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 'local',
    localRoot: process.env.STORAGE_LOCAL_ROOT ?? './storage',
  },
  knowledgeBase: {
    maxFileSizeBytes: Number(process.env.KB_MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024,
    allowedMimeTypes: (
      process.env.KB_ALLOWED_MIME_TYPES ??
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
    )
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  },
  ingestion: {
    chunkTargetTokens: Number(process.env.KB_CHUNK_TARGET_TOKENS ?? 500),
    chunkMaxTokens: Number(process.env.KB_CHUNK_MAX_TOKENS ?? 750),
    chunkMinTokens: Number(process.env.KB_CHUNK_MIN_TOKENS ?? 80),
    chunkOverlapTokens: Number(process.env.KB_CHUNK_OVERLAP_TOKENS ?? 50),
    pdfMinTextCharsPerPage: Number(process.env.KB_PDF_MIN_TEXT_CHARS_PER_PAGE ?? 30),
    pdfMaxEmptyPageRatio: Number(process.env.KB_PDF_MAX_EMPTY_PAGE_RATIO ?? 0.6),
    staleMinutes: Number(process.env.KB_INGESTION_STALE_MINUTES ?? 15),
    maxExtractedCharacters: Number(process.env.KB_MAX_EXTRACTED_CHARACTERS ?? 5000000),
    maxPdfPages: Number(process.env.KB_MAX_PDF_PAGES ?? 1000),
    maxChunks: Number(process.env.KB_MAX_CHUNKS ?? 10000),
    allowUnscannedProcessing:
      process.env.APP_ENV !== 'production' && process.env.KB_ALLOW_UNSCANNED_PROCESSING === 'true',
    ocrProvider: process.env.OCR_PROVIDER ?? 'none',
    malwareScannerProvider: process.env.MALWARE_SCANNER_PROVIDER ?? 'none',
    windowsDefenderPath: process.env.WINDOWS_DEFENDER_MPCMDRUN_PATH,
  },
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'openai',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY || '',
    dimension: 1536,
    distanceMetric: 'cosine',
    preprocessingVersion: 'normalized-chunk-v1',
    batchSize: Number(process.env.EMBEDDING_BATCH_SIZE ?? 32),
    timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 30000),
    staleMinutes: Number(process.env.EMBEDDING_STALE_MINUTES ?? 15),
  },
  retrieval: {
    topK: Number(process.env.RAG_TOP_K ?? 12),
    maxTopK: Number(process.env.RAG_MAX_TOP_K ?? 50),
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY ?? 0.35),
    vectorWeight: Number(process.env.RAG_VECTOR_WEIGHT ?? 0.7),
    keywordWeight: Number(process.env.RAG_KEYWORD_WEIGHT ?? 0.3),
    vectorCandidateK: Number(process.env.RAG_VECTOR_CANDIDATE_K ?? 40),
    keywordCandidateK: Number(process.env.RAG_KEYWORD_CANDIDATE_K ?? 40),
    contextBudgetTokens: Number(process.env.RAG_CONTEXT_BUDGET_TOKENS ?? 6000),
    strategyVersion: process.env.RAG_RETRIEVAL_STRATEGY_VERSION ?? 'hybrid-v1',
  },
  aiGeneration: {
    provider: process.env.AI_PROVIDER || 'openai',
    model: process.env.AI_MODEL || '',
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '',
    temperature: Number(process.env.AI_TEMPERATURE ?? 0.2),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 4000),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60000),
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 1),
    maxQuestionsPerRequest: Number(process.env.AI_MAX_QUESTIONS_PER_REQUEST ?? 100),
    promptStrategyVersion: process.env.AI_PROMPT_STRATEGY_VERSION ?? 'grounded-question-v1',
    staleMinutes: Number(process.env.AI_STALE_MINUTES ?? 15),
  },
  subscription: { reservationTtlMinutes: Number(process.env.USAGE_RESERVATION_TTL_MINUTES ?? 30) },
  billing: {
    provider: process.env.PAYMENT_PROVIDER || '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
    successUrl: process.env.BILLING_SUCCESS_URL ?? 'http://localhost:3000/billing/success',
    cancelUrl: process.env.BILLING_CANCEL_URL ?? 'http://localhost:3000/billing/cancel',
    portalReturnUrl:
      process.env.BILLING_PORTAL_RETURN_URL ?? 'http://localhost:3000/settings/billing',
    safepay: {
      environment: process.env.SAFEPAY_ENVIRONMENT ?? 'sandbox',
      publicKey: process.env.SAFEPAY_PUBLIC_KEY || '',
      secretKey: process.env.SAFEPAY_SECRET_KEY || '',
      webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || '',
      timeoutMs: Number(process.env.SAFEPAY_TIMEOUT_MS ?? 15000),
    },
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
    fromName: process.env.SMTP_FROM_NAME || 'AI Test Generation',
    workerIntervalMs: Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 5000),
    tokenEncryptionKey: process.env.EMAIL_TOKEN_ENCRYPTION_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      connectionTimeoutMs: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 10000),
      greetingTimeoutMs: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 10000),
      socketTimeoutMs: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 30000),
    },
  },
  pdf: {
    renderer: 'pdf-lib',
    renderVersion: process.env.PDF_RENDER_VERSION ?? 'test-pdf-v1',
    maxFileSizeBytes: Number(process.env.PDF_MAX_FILE_SIZE_BYTES ?? 10485760),
    maxQuestions: Number(process.env.PDF_MAX_QUESTIONS ?? 500),
    storagePrefix: process.env.TEST_EXPORT_STORAGE_PREFIX ?? 'test-exports',
  },
});
