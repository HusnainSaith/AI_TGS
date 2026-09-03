# Deployment and staging runbook

This runbook prepares the existing NestJS service for staging or production. It does not select a hosting platform or authorize a deployment.

## Environment matrix

| Category        | Development                                         | Test                                         | Staging                                                   | Production                                            |
| --------------- | --------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Runtime         | Node.js 22+, `npm run start:dev`                    | Node.js 22+, deterministic providers allowed | Node.js 22+, production build                             | Node.js 22+, production build                         |
| PostgreSQL      | Local disposable/developer database                 | Dedicated disposable database                | Managed/dedicated database                                | Managed/dedicated database with tested backups        |
| pgvector        | Required for RAG                                    | Required for PostgreSQL E2E                  | Required, compatible with schema                          | Required, compatible with schema                      |
| AI generation   | `test` or explicitly configured real provider       | `test`                                       | Real provider and supported generation model              | Real provider and supported generation model          |
| Embeddings      | `test` or OpenAI                                    | `test`                                       | OpenAI `text-embedding-3-small`                           | OpenAI `text-embedding-3-small`                       |
| SMTP            | Optional                                            | Mock/unconfigured                            | Recommended for account flows                             | Required                                              |
| Malware scanner | Optional, publication remains blocked without CLEAN | Mock only in isolated tests                  | Required for KB publication                               | Required for KB publication                           |
| OCR             | Optional                                            | Mock/unconfigured                            | Optional; scanned PDFs remain blocked without it          | Based on accepted document policy                     |
| Safepay         | Test or disabled                                    | Test                                         | May remain disabled while billing validation is postponed | Enable only after live credentials/webhook validation |
| CORS/TLS        | Local HTTP origins allowed                          | Local test origin                            | Explicit HTTPS origin                                     | Explicit HTTPS origin only                            |

## Configuration and secrets

Inject secrets through the hosting platform's secret manager or protected environment configuration. Never bake them into an image, service file, repository, command history, or logs.

Required secrets:

- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: distinct, high-entropy values of at least 32 characters.
- `EMAIL_TOKEN_ENCRYPTION_KEY`: standard base64 encoding of exactly 32 random bytes; keep stable while queued security emails exist.
- `OPENAI_API_KEY` for the current OpenAI embedding adapter. `AI_API_KEY` may be used by the generation adapter, but only with a model supported by that adapter's configured API endpoint.
- `SMTP_PASSWORD` when authenticated SMTP is used.
- `SAFEPAY_SECRET_KEY` and `SAFEPAY_WEBHOOK_SECRET` only when Safepay is enabled.
- `DATABASE_PASSWORD` and any platform TLS trust material.

Important non-secret settings include `APP_ENV`, `PORT`, `API_PREFIX`, `CORS_ORIGINS`, `FRONTEND_URL`, provider/model selections, database host/port/name/user, pool limits, upload/parser limits, worker intervals, and public Safepay identifiers. Start from `.env.example`; do not copy a developer `.env` to a server.

Production validation intentionally fails closed for deterministic providers, wildcard/non-HTTPS CORS, non-HTTPS frontend links, missing SMTP, missing email encryption key, and unsafe malware bypass. Keep generation and embedding models separate: `text-embedding-3-small` is never a generation model.

## Infrastructure prerequisites

1. Install Node.js 22 or a compatible later release and use `npm ci` from the committed lockfile.
2. Provision PostgreSQL compatible with the tested schema and install pgvector before RAG migrations. The current local validation used PostgreSQL with pgvector 0.8.6 and `vector(1536)` storage.
3. Provision private object-storage persistence. The current local adapter uses a filesystem root, which must reside on durable non-public storage and must not be served as static content.
4. If Windows Defender is selected, the application host must be Windows and `WINDOWS_DEFENDER_MPCMDRUN_PATH` must point to the trusted scanner executable. Other platforms require a real scanner adapter before KB publication.
5. Set OS/container memory and CPU limits because PDF/DOCX parsing, generation orchestration, and PDF rendering occur in process.

## Database creation and migrations

Create the database and least-privilege application/migration roles through infrastructure administration. Enable pgvector using an authorized migration role:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run migrations explicitly during a controlled release, before starting new application instances:

```powershell
npm ci
npm run build
npm run migration:run:foundation
npm run migration:run:rag
npm run migration:run
npm run migration:show
npm run migration:show:rag
```

The expected current state is 14 core migrations and 3 RAG migrations. `synchronize` must remain `false`. Never run application migrations concurrently from every replica.

## Build, start, and process management

Build with `npm run build` and start with `npm start`. Use the hosting platform's process supervisor, systemd, a container orchestrator, or another selected service manager; the repository does not mandate one. Run as a non-administrator with read access only to required secrets and write access only to the private storage root.

Terminate with SIGTERM for rolling releases. Nest shutdown hooks stop notification polling, wait up to five seconds for its active cycle, close the Nodemailer pool, and release PostgreSQL connections. Configure the platform termination grace period above that drain window. Durable leases recover abandoned ingestion, embedding, generation, PDF, and notification work.

## Reverse proxy, HTTPS, and CORS

Terminate trusted TLS 1.2 or later at a reverse proxy/load balancer using a publicly trusted certificate. Forward the original protocol and client address only from trusted proxy infrastructure; set `TRUST_PROXY=true` only in that topology. Redirect HTTP to HTTPS and enforce an appropriate request-body limit at the edge in addition to application limits.

Set `FRONTEND_URL` and every comma-separated `CORS_ORIGINS` entry to the exact HTTPS application origins. Credentials are enabled, so wildcards are forbidden.

## Provider readiness

- AI generation: select a supported `AI_PROVIDER` and explicit `AI_MODEL`, then supply its key. `AI_MAX_OUTPUT_TOKENS` is a server-controlled completion ceiling (default 4,000; allowed 100-16,384); size it for the configured question count and schema, and monitor `AI_OUTPUT_TRUNCATED` rather than retrying paid calls automatically.
- Embeddings: set `EMBEDDING_PROVIDER=openai`, `EMBEDDING_MODEL=text-embedding-3-small`, and provide `OPENAI_API_KEY` or `EMBEDDING_API_KEY`. Expected dimension is 1,536 with cosine distance.
- SMTP: set the SMTP host, port, security mode, sender, and optional credentials. Port 465 requires implicit TLS. Validate without sending mail using `npm run smtp:verify`.
- Malware: configure a real scanner. Publication must remain blocked unless the immutable version records a CLEAN result.
- OCR: OCR-required PDFs remain unpublishable until a real OCR provider is configured.
- Safepay: keep disabled until sandbox/live checkout, webhook, cancellation, and reconciliation validation is explicitly scheduled.

## Health, monitoring, and logs

- `GET /api/v1/health/live` is dependency-free liveness.
- `GET /api/v1/health` reports safe database, pgvector, provider-configuration, scanner, OCR, and billing readiness without credentials or hosts.

Alert on repeated HTTP 5xx responses, database failures/pool exhaustion, stale or failed worker records, AI/embedding provider failures, SMTP terminal failures, PDF failures, malware scan failures, and quota/accounting anomalies. Centralize logs with retention and access controls. Never ingest authorization headers, cookies, raw tokens, provider keys, raw webhook bodies, email bodies, or vectors.

## Resource limits

Retain application limits from `.env.example`: upload bytes, extracted characters, PDF pages, chunk count, AI request size/output tokens, PDF output size/questions, SMTP pool connections, database pool size, and provider timeouts. Match reverse-proxy upload/body limits to application policy. Start with measured platform memory/CPU limits, observe staging peak usage, and adjust from evidence rather than increasing concurrency blindly.

## Backup and restore

Take encrypted, access-controlled PostgreSQL custom-format backups from a trusted administration host:

```powershell
pg_dump --format=custom --no-owner --no-acl --file=tgs-YYYYMMDD.dump --dbname=$env:DATABASE_URL
```

Also back up the private object-storage root/bucket consistently with the database and retain deployment configuration metadata without secret values. Record PostgreSQL and pgvector versions with each backup.

Validate restore only into a newly created disposable database, never the active database:

```powershell
createdb tgs_restore_validation
psql --dbname=tgs_restore_validation --command="CREATE EXTENSION IF NOT EXISTS vector;"
pg_restore --exit-on-error --no-owner --no-acl --dbname=tgs_restore_validation tgs-YYYYMMDD.dump
```

After restore, run migration status, verify pgvector and `vector(1536)`, compare critical table counts, and run read-only smoke tests. Drop the disposable database only after confirming its resolved name and retaining the validation record. No restore was performed during creation of this runbook because an explicitly disposable validation database was not authorized.

## Release verification and rollback

Before traffic:

1. Run `npm audit`, build, lint, unit tests, and PostgreSQL E2E against a dedicated staging database.
2. Verify migrations, `/health/live`, and `/health`.
3. Perform one tiny real embedding request and one tiny real generation request, then the controlled KB-to-RAG-to-generation flow.
4. Verify SMTP configuration and a controlled recipient when explicitly authorized.
5. Confirm logs contain no secrets and dashboards/alerts receive safe failure events.

For rollback, stop new instances gracefully and redeploy the previous immutable application artifact. Prefer forward database fixes: do not automatically revert a migration after new code has written data. If a release includes a backward-incompatible schema change, use a separately reviewed expand/migrate/contract plan. Restore from backup only for corruption/data-loss recovery, never as a routine application rollback.
