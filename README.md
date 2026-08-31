# AI Test Generation System — Backend

NestJS modular-monolith foundation for a source-grounded automatic test generation platform. Phase 1 provides secure identity/authentication, RBAC and tenant context, curriculum persistence, audit records, infrastructure contracts, queues, and health checks. Feature-complete RAG, AI, ingestion, billing, and PDF processing are intentionally deferred.

The Manual Question Bank is available at `/api/v1/questions`. Teachers own private manual banks; system administrators have moderation access; school administrators receive no implicit cross-user access. The schema is shared with future AI-generated questions without exposing provenance fields to clients.

The secure Knowledge Base source foundation is available at `/api/v1/kb`. System administrators create GLOBAL documents; school administrators create and manage SCHOOL documents for their server-derived school. Teachers have metadata read access only. Metadata and physical uploads are separate: `POST /kb/documents/:id/versions` accepts bounded multipart PDF, DOCX, or TXT uploads, validates declared MIME plus signature, calculates SHA-256, and writes a generated quarantine key. Historical versions are immutable and duplicate bytes within one logical document return `409`.

## Prerequisites

- Node.js 22+ (Node 24 is supported)
- npm
- A locally installed PostgreSQL server (primary development path)
- Redis when queue-backed features are being exercised

## Setup

```bash
npm install
copy .env.example .env
npm run migration:run
npm run start:dev
```

Do not commit `.env`; replace both JWT secrets and database credentials. Provider keys are optional until their adapters are invoked.

Local Knowledge Base storage defaults to `./storage` and is ignored by Git. Configure `STORAGE_LOCAL_ROOT`, `KB_MAX_FILE_SIZE_MB`, and `KB_ALLOWED_MIME_TYPES` as needed. Quarantine is never statically served and responses do not expose storage keys or absolute paths. Every upload creates a durable `QUEUED` job at `SIGNATURE_VALIDATION`; Redis absence does not block CRUD/upload. Before processing, malware remains `NOT_SCANNED`, extraction remains `PENDING`, and `activeVersionId` remains null. Publication and retrieval remain explicit later phases.

Ingestion processing is available through the shared `IngestionProcessorService`; the restricted `POST /api/v1/kb/ingestion-jobs/:id/process` endpoint invokes that same service while Redis is unavailable. PDF.js extracts page-aware PDF text, Mammoth converts DOCX semantic structure into ordered headings/paragraphs, and TXT extraction preserves line ranges. Normalized deterministic chunks retain honest JSON locators and SHA-256 content hashes. Success ends at `AWAITING_MAPPING` / `READY_FOR_MAPPING`, never publication.

No malware scanner or OCR provider is configured by default. Production rejects unscanned processing. Controlled synthetic development/test processing requires `KB_ALLOW_UNSCANNED_PROCESSING=true`; this does not change `NOT_SCANNED` to `CLEAN`. Scanned PDFs fail with `OCR_PROVIDER_NOT_CONFIGURED` until a real provider is configured. Chunk token counts are deterministic estimates (`ceil(characters / 4)`), not model-specific tokenizer counts.

Publication now performs the complete readiness preflight again inside a serializable, row-locking transaction. It snapshots approved mapping IDs and the active embedding configuration on the immutable version, sets `publishedAt`, and atomically switches the logical document's `activeVersionId`. New retrieval considers only that active published version; historical versions remain available through persisted evidence snapshots.

Hybrid retrieval is isolated in `RetrievalModule`. Eligible candidates are tenant-, curriculum-, language-, document-, publication-, mapping-, and active-embedding-filtered in PostgreSQL before scoring. Exact pgvector cosine similarity (`1 - cosine distance`) is combined with normalized PostgreSQL FTS rank using configurable weights. Deterministic overlap/hash suppression and whole-chunk context packing produce stable `SRC_n` labels. Every attempt persists a `RetrievalEvent`; selected evidence is normalized in `retrieval_event_chunks` with score, hash, and locator snapshots. No prompt or question generation occurs.

English content uses the `english` FTS configuration; other languages use PostgreSQL `simple` without false stemming claims. ANN indexes and external reranking remain deferred. The local PostgreSQL server must expose the `vector` extension before the RAG migrations and retrieval endpoints can operate.

Windows Defender is the first real malware adapter. It is opt-in with `MALWARE_SCANNER_PROVIDER=windows_defender` and an explicit `WINDOWS_DEFENDER_MPCMDRUN_PATH`; `none` remains the default. Scanning reads quarantined bytes through object storage, materializes a random temporary file, invokes Defender without remediation, deletes the temporary file, and persists provider/time/status metadata. CLEAN is idempotent, FAILED may retry, and INFECTED is not automatically retried. The administrative `POST /api/v1/kb/ingestion-jobs/:id/scan` endpoint enforces system/same-school administration. Publication requires CLEAN plus complete active embeddings.

Local validation uses the documented `ai_test_generation` database. Core migrations through `MalwareScanning1725700000000` and PostgreSQL E2E tests have been verified locally. `.gitattributes` now establishes LF for source and documentation without mass-rewriting the existing CRLF baseline.

## LOCAL POSTGRESQL SETUP — WITHOUT DOCKER

1. Install PostgreSQL and ensure its Windows service is running.
2. Create the development database in `psql`:

   ```sql
   CREATE DATABASE ai_test_generation;
   ```

   In pgAdmin, right-click **Databases**, choose **Create → Database**, and use the same name.

3. Set `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, and `DATABASE_SSL=false` in `.env`.
4. Run `npm run migration:show`, then `npm run migration:run`.
5. Start the API with `npm run start:dev`.
6. Verify `GET http://localhost:3000/api/v1/health`.
7. Open `http://localhost:3000/api/docs` during development.

Core migrations do not require pgvector. The verified local PostgreSQL 17 installation uses pgvector 0.8.6. Run `npm run migration:run:rag` to enable `vector` and create the independent embedding schema; core curriculum migrations remain separate.

## PGVECTOR INSTALLATION ON WINDOWS — LOCAL POSTGRESQL

This workstation was validated with PostgreSQL 17.10 installed at `C:\Program Files\PostgreSQL\17` and pgvector 0.8.6 from the official `pgvector/pgvector` repository. Match `PGROOT` to the installation reported by `pg_config`; do not install another PostgreSQL server just for pgvector.

1. Install Visual Studio Build Tools 2022 with **Desktop development with C++**, the x64 MSVC compiler, and a Windows SDK. The full Visual Studio IDE is not required.
2. Open an elevated **x64 Native Tools Command Prompt for VS 2022**.
3. Verify the target PostgreSQL paths with `pg_config --version`, `pg_config --bindir`, `pg_config --libdir`, and `pg_config --sharedir`.
4. Clone official pgvector outside this repository and select the required release:

   ```cmd
   cd /d %TEMP%
   git clone --depth 1 --branch v0.8.6 https://github.com/pgvector/pgvector.git pgvector-0.8.6-build
   cd pgvector-0.8.6-build
   set "PGROOT=C:\Program Files\PostgreSQL\17"
   nmake /F Makefile.win
   nmake /F Makefile.win install
   ```

5. Confirm `%PGROOT%\lib\vector.dll`, `%PGROOT%\share\extension\vector.control`, and the versioned SQL files exist. A PostgreSQL service restart is normally unnecessary; restart only the detected PostgreSQL service if `pg_available_extensions` still cannot see `vector`.
6. Check availability with `SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name='vector';`.
7. Let the independent migration chain enable and own the database schema:

   ```powershell
   npm run migration:show:rag
   npm run migration:run:rag
   npm run migration:show:rag
   ```

8. Verify enablement with `SELECT extname, extversion FROM pg_extension WHERE extname='vector';`. The expected result for this project is `vector | 0.8.6`.

Docker Compose remains an optional alternative: `docker compose up -d` and `docker compose down`.

The API base is `http://localhost:3000/api/v1`. Development Swagger UI is at `http://localhost:3000/api/docs` and is disabled in production. Health is `GET /api/v1/health`.

## Grounded AI generation foundation

`AiGenerationModule` exposes durable asynchronous generation under `/api/v1/ai`. `POST /ai/tests/generate` validates the complete curriculum hierarchy and expands a bounded request into Topic + type + difficulty items without calling an AI provider. The controlled `POST /ai/jobs/:jobId/process` endpoint uses PostgreSQL processing tokens/leases and the same service a future BullMQ worker can invoke; Redis is not required.

MVP generation is REQUIRED-grounding only. Every item calls `RetrievalService`, persists its own RetrievalEvent, builds an injection-resistant prompt from labeled evidence, and skips the generation provider when evidence is insufficient. Strict JSON, count, type, difficulty, server marks, option structure, citations, and exact duplicates are validated before Questions are atomically saved as `AI_GENERATED`, `PENDING`, `ACTIVE`, and `GROUNDED`. `question_citations` copies immutable chunk/version/locator/hash/score provenance from selected evidence. Regeneration creates new evidence and questions without overwriting history; DELETE records cancellation rather than deleting questions or citations.

Configure `AI_PROVIDER=openai`, an explicit `AI_MODEL`, and `OPENAI_API_KEY` for production generation. No model is guessed when `AI_MODEL` is empty. `AI_PROVIDER=test` is deterministic, has failure simulations, makes no external calls, and is rejected in production.

Generation is subscription-gated. Administrators persist plans and individual/school-pooled subscriptions under `/api/v1/admin`; owners inspect `/api/v1/subscription` and `/api/v1/subscription/usage`. `null` alone means an unlimited limit. AI-question capacity is reserved atomically before retrieval/provider work, then settled from successfully persisted `AI_GENERATED` Questions. Insufficient knowledge, rejected/invalid output, and provider failures charge zero; cancellation and partial completion settle persisted questions and release the remainder. Usage uses UTC `[periodStart, periodEnd)`, PostgreSQL row locks, idempotent unique references, and an append-only ledger. `USAGE_RESERVATION_TTL_MINUTES` controls stale reservations; the admin expiry trigger skips jobs with a live lease. Payment integration, pricing seeds, and automatic Free assignment remain deferred.

The persisted Test Builder is exposed at `/api/v1/tests`. Drafts assemble owned active Questions into independent snapshots containing paper text, ordered options, answers, marks, curriculum, review/grounding state, and safe citation provenance. Snapshots freeze when added; draft refresh is explicit, and finalized artifacts never render from mutable Question rows. PENDING AI Questions may be reviewed in a draft but must be APPROVED before finalization. Finalization locks the Test, revalidates eligibility, calculates totals, atomically consumes one `TESTS` unit, and becomes idempotently immutable. Preview excludes answers; the authorized answer-key endpoint reads snapshots. Clone creates a free independent draft; archive preserves history and never refunds usage.

Finalized Tests support secure question-paper and answer-key PDF artifacts through `/api/v1/tests/:testId/exports`. A provider-neutral render model projects frozen TestQuestion snapshots into explicit `QUESTION_PAPER` and `ANSWER_KEY` modes; the paper projection contains no answer fields. The pure-Node `pdf-lib` adapter produces deterministic A4, multi-page PDFs with page numbering and no remote assets or browser runtime. Artifacts use opaque object-storage keys, while sanitized user-facing filenames never become paths. Completed metadata records MIME type, byte size, SHA-256, renderer version, snapshot version, and download history; storage paths are never returned.

`PDF_EXPORTS` counts unique successfully stored artifacts. Creation reserves one unit before rendering, settles only after validated storage, and releases on failure. The same finalized Test + export type + render version reuses its completed artifact without another charge; downloads are free. PostgreSQL advisory/cache locks plus processing leases prevent duplicate concurrent rendering. Configure `PDF_RENDER_VERSION`, `PDF_MAX_FILE_SIZE_BYTES`, `PDF_MAX_QUESTIONS`, and `TEST_EXPORT_STORAGE_PREFIX`; local development reuses the existing private filesystem storage provider.

## Quality commands

```bash
npm run build
npm run lint
npm test
npm run test:cov
npm run test:e2e
npm run format
```

Migrations use `npm run migration:run`, `npm run migration:revert`, and `npm run migration:generate -- src/database/migrations/Name`.
Use `npm run migration:show` for core state and `npm run migration:show:rag` for optional RAG state.

## Structure

- `src/common` — transport/security primitives, typed user and tenant context
- `src/config` — centralized validated environment configuration
- `src/database` — TypeORM setup and migrations
- `src/infrastructure` — queues and vendor-neutral provider contracts
- `src/modules` — feature-owned identity, auth, schools, curriculum, audit, health
- `docs` — SRS-derived implementation plan and explicit decisions

## Security notes

Passwords use Argon2id. Opaque verification/reset tokens and refresh JWTs are stored only as SHA-256 digests. Refresh rotation, reuse-family revocation, current-user status reload, RBAC, input allow-listing, rate limits, Helmet, restricted CORS, correlation IDs, and production-safe exception responses are foundational controls. Place the service behind an HTTPS reverse proxy and configure `TRUST_PROXY=true` only when the proxy is trusted. Tenant-owned repositories must require server-derived tenant context; never accept a school scope solely from request payloads.

Question rules: MCQs require four uniquely ordered options and one correct answer. TRUE/FALSE uses two `TRUE`/`FALSE` options. SHORT, LONG, and FILL_BLANK reject options; fill-blank model answers use `explanation`. DELETE archives questions. Questions are scoped to Topic/Chapter/Subject/Class; Section remains test context and is not persisted on Question.

## Curriculum mapping and review foundation

Processed versions support multiple whole-version curriculum mappings through `/api/v1/kb/document-versions/:id/mappings`. Paths are contiguous, may stop at any level from Board through Topic, and must reference active related curriculum. Specificity is derived as Board=1 through Topic=5. Mappings follow `DRAFT -> PENDING_REVIEW -> APPROVED|REJECTED`; DELETE archives history. GLOBAL mutation is SYSTEM_ADMIN-only, while SCHOOL_ADMIN is limited to its server-derived school. PostgreSQL prevents duplicate active logical paths.

Administrative preview, paginated immutable chunks, readiness, review submission, guarded publication preflight, and metadata-only coverage are exposed below `/api/v1/kb`. Review requires completed extraction, verified non-empty chunks, confirmed rights, and an approved mapping. Publication additionally requires real CLEAN malware and active embeddings; no endpoint automatically marks a version PUBLISHED. Coverage is not semantic coverage or retrieval quality. Range mappings, OCR, retrieval, RAG, and AI generation remain deferred.

## Embedding foundation

The selected MVP provider is OpenAI `text-embedding-3-small`. Official OpenAI documentation verifies its default 1,536 dimensions, optional dimension reduction, batch input, token usage fields, and cosine recommendation. This generation deliberately uses the provider default (`vector(1536)`) and cosine distance. No ANN index is created until retrieval measurements justify one.

Configure `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=text-embedding-3-small`, and `OPENAI_API_KEY`. Batch size, timeout, and PostgreSQL lease duration are independently bounded. Missing credentials leave the application and database healthy but block real embedding work and publication. The deterministic provider is test-only and rejected in production.

`content_chunk_embeddings` stores one row per chunk and deterministic configuration version, preserving prior generations for rollback/evaluation. The version hashes provider, model, dimension, distance metric, and preprocessing policy. Content-hash mismatch, failed rows, and inactive configuration are re-index candidates; valid identical rows are skipped. `embedding_jobs` supplies durable progress, bounded retries, UUID processing leases, usage/operational metrics, and safe audit events. Vectors and secrets are never returned.

Administrative operations are `POST /kb/document-versions/:id/embed`, `POST /kb/document-versions/:id/embeddings/reindex`, and `POST /kb/embedding-jobs/:id/retry`; status is `GET /kb/document-versions/:id/embeddings`. SYSTEM_ADMIN may moderate all content, SCHOOL_ADMIN may mutate only its SCHOOL content, and TEACHER has status-only access. Embedding requires CLEAN malware, completed extraction, a non-archived source, and valid chunks; mapping may proceed independently. Publication is never automatic. Hybrid retrieval, FTS, retrieval events, citations, RAG, and question generation remain deferred.

# Billing foundation

Billing is provider-neutral and remains separate from product authorization. `Subscription`, `Plan`, `EntitlementService`, and period-scoped usage remain authoritative for access. Safepay is selected for the Pakistan MVP (`PAYMENT_PROVIDER_DECISION_REQUIRED=false`) behind the existing adapter boundary; `PAYMENT_PROVIDER=test` remains development/test-only.

Checkout accepts a plan ID, owner type, and idempotency key. Price IDs, currency, amounts, and redirect URLs are resolved by the server. Checkout never grants entitlement: only a verified webhook can synchronize provider state. Webhooks use the exact raw request bytes, database-enforced `(provider, provider_event_id)` idempotency, transactional processing, and provider-event-time stale update protection. Financial history uses integer minor units. Card numbers, CVV, credentials, authorization headers, and raw provider payloads are never persisted.

Configuration: `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`, and `BILLING_PORTAL_RETURN_URL`. The test provider is forbidden in production. A blank provider leaves billing checkout safely unavailable without affecting application health.

## Safepay

Set `PAYMENT_PROVIDER=safepay`, choose `SAFEPAY_ENVIRONMENT=sandbox|production`, and provide the empty-in-source `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_SECRET_KEY`, and `SAFEPAY_WEBHOOK_SECRET` variables. Sandbox and live API hosts are selected explicitly. Safepay plans are created in its dashboard and their `plan_...` IDs are mapped to local plans through the admin plan-price API. Hosted subscription checkout uses a short-lived passport token and server-owned return/cancel URLs; redirects are UX-only.

Safepay webhook schema `2.0.0` is received at `POST /api/v1/billing/webhooks/safepay`. The exact raw bytes are verified against `X-SFPY-SIGNATURE` using HMAC-SHA512 before parsing. Supported events are subscription creation/cancellation/end/resumption, recurring payment success/failure, and payment success/failure. Unknown events are safely ignored. Safepay cancellation is immediate/provider-defined; portal, in-place plan changes, and authoritative subscription fetch/reconciliation are explicitly unsupported because the current public API does not document them.

For local webhook delivery Safepay requires a publicly reachable endpoint (HTTPS with TLS 1.2/1.3 for live). Configure that URL in the Safepay dashboard; do not hard-code tunnel URLs. Optional connectivity validation is `RUN_SAFEPAY_SANDBOX_TESTS=true npm run test:safepay:sandbox` and refuses non-sandbox environments. No card data crosses this backend.
