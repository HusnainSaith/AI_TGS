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

Local Knowledge Base storage defaults to `./storage` and is ignored by Git. Configure `STORAGE_LOCAL_ROOT`, `KB_MAX_FILE_SIZE_MB`, and `KB_ALLOWED_MIME_TYPES` as needed. Quarantine is never statically served and responses do not expose storage keys or absolute paths. Every upload creates a durable `QUEUED` job at `SIGNATURE_VALIDATION`; Redis absence does not block CRUD/upload. Before processing, malware remains `NOT_SCANNED`, extraction remains `PENDING`, and `activeVersionId` remains null. Embeddings, mapping, publication, and retrieval remain deferred.

Ingestion processing is available through the shared `IngestionProcessorService`; the restricted `POST /api/v1/kb/ingestion-jobs/:id/process` endpoint invokes that same service while Redis is unavailable. PDF.js extracts page-aware PDF text, Mammoth converts DOCX semantic structure into ordered headings/paragraphs, and TXT extraction preserves line ranges. Normalized deterministic chunks retain honest JSON locators and SHA-256 content hashes. Success ends at `AWAITING_MAPPING` / `READY_FOR_MAPPING`, never publication.

No malware scanner or OCR provider is configured by default. Production rejects unscanned processing. Controlled synthetic development/test processing requires `KB_ALLOW_UNSCANNED_PROCESSING=true`; this does not change `NOT_SCANNED` to `CLEAN`. Scanned PDFs fail with `OCR_PROVIDER_NOT_CONFIGURED` until a real provider is configured. Chunk token counts are deterministic estimates (`ceil(characters / 4)`), not model-specific tokenizer counts.

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

Core migrations do not require pgvector. When RAG work begins, install pgvector for the exact local PostgreSQL major version and run `npm run migration:run:rag`. The command fails with an actionable message when the server lacks the extension; it does not roll back core curriculum migrations.

Docker Compose remains an optional alternative: `docker compose up -d` and `docker compose down`.

The API base is `http://localhost:3000/api/v1`. Development Swagger UI is at `http://localhost:3000/api/docs` and is disabled in production. Health is `GET /api/v1/health`.

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
