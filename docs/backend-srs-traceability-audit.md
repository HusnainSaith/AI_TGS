# Backend SRS Traceability and Gap Audit

## 1. Executive Summary

This audit began at commit `92ecf6f66b7a66fb73bb029facf627f67a5689b6` and has been updated for the BullMQ worker implementation against the complete Master SRS v2.2. The implementation has a strong, tested core, including independently runnable asynchronous workers. The real OpenRouter/RAG path has also been manually accepted.

Backend feature development is nevertheless not complete against the SRS. School-scoped sharing, current-cycle usage/storage reporting, and immutable complete PDF branding are now implemented. Substantial gaps remain in test sections, billing lifecycle behavior, source-issue workflows, OCR quality, observability, and operational recovery evidence.

**Final verdict: D. BACKEND HAS MAJOR FEATURE GAPS.**

## 2. SRS Source

- Primary source: `docs/SRS.md`
- Document: *Software Requirements Specification — AI-Powered Automatic Test Generation System*
- Version/date: 2.2 / 29 August 2026
- Scope reviewed: all 745 lines, including FR-01–FR-60, detailed AI/RAG requirements, monetization, database/API contracts, NFRs, testing, deployment, acceptance criteria, risks, and architecture.

## 3. Audit Method

The audit traced requirements to controllers, DTOs, services, providers, guards, entities, migrations, tests, validation harnesses, and operational documentation. Source presence alone was not treated as proof: API reachability, authorization, persistence constraints, and tests were considered. Operational documentation was classified as PARTIAL unless deployment evidence existed. Phase 2/future requirements were classified DEFERRED only where the SRS or project decisions explicitly postpone them.

No application code, migration, environment, database data, provider, payment system, or SMTP system was changed or called during this audit.

## 4. Completion Metrics

| Metric | Value |
|---|---:|
| TOTAL_BACKEND_REQUIREMENTS | 80 |
| IMPLEMENTED | 56 |
| PARTIAL | 21 |
| NOT_IMPLEMENTED | 1 |
| DEFERRED | 2 |
| NOT_APPLICABLE | 0 |
| Actionable requirements | 78 |
| Strict completion | 56 / 78 = **71.8%** |
| Weighted completion | (56 + 0.5 × 21) / 78 = **85.3%** |

“Actionable” excludes DEFERRED and NOT_APPLICABLE. The weighted metric gives PARTIAL requirements half credit; it does not imply launch readiness.

## 5. Full Requirement Traceability Matrix

### Functional requirements

| ID | Requirement | Status | Evidence | Missing / severity / recommended fix |
|---|---|---|---|---|
| FR-01 | Registration, login, logout, verification, reset, JWT/refresh | IMPLEMENTED | `src/modules/auth/*`; `1725000000000-Foundation.ts`; auth PostgreSQL E2E | — |
| FR-02 | Login returns tokens, profile, role, active subscription | IMPLEMENTED | `AuthService.login`; `SubscriptionsService`; auth tests | — |
| FR-03 | Verification before unrestricted access | IMPLEMENTED | `VerifiedEmailGuard`; `@RequireVerifiedEmail`; verification token flow | — |
| FR-04 | Expiring forgot/reset-password flow | IMPLEMENTED | `AuthService`; hashed `auth_tokens`; notification templates | — |
| FR-05 | Profile, phone, image, password, revoke all sessions | PARTIAL | `UsersController`; `UsersService`; `/auth/logout-all` | Profile image upload/update is absent. **MEDIUM.** Add authorized image storage/validation endpoint and audit coverage. |
| FR-06 | Board CRUD/archive | IMPLEMENTED | `boards.controller/service`; curriculum migrations/E2E | — |
| FR-07 | Class CRUD and board linkage | IMPLEMENTED | `classes.controller/service`; hierarchy tests | — |
| FR-08 | Section CRUD under class | IMPLEMENTED | `sections.controller/service` | — |
| FR-09 | Subject CRUD and class/board validation | IMPLEMENTED | `subjects.controller/service` | — |
| FR-10 | Chapter CRUD/order | IMPLEMENTED | `chapters.controller/service` | — |
| FR-11 | Topic CRUD/order | IMPLEMENTED | `topics.controller/service` | — |
| FR-12 | Manual question CRUD/search/filter | IMPLEMENTED | `QuestionsController/Service`; question E2E | — |
| FR-13 | Five MVP question types | IMPLEMENTED | `QuestionType`; DB enum; validators/tests | — |
| FR-14 | Four-option, one-answer MCQ | IMPLEMENTED | `QuestionValidatorService`; option order constraints/tests | — |
| FR-15 | Easy/medium/hard and generation mix | IMPLEMENTED | DTOs; `GenerationUnitExpander`; generation tests | — |
| FR-16 | Full-text question search by text/academic data | PARTIAL | `QuestionsService.list`; `ListQuestionsDto` | Text uses pattern search rather than a dedicated PostgreSQL FTS index; academic fields are filters, not unified search. **MEDIUM.** Add indexed FTS/search-vector behavior and ranking tests. |
| FR-17 | Question filtering including section and source | PARTIAL | `ListQuestionsDto` supports class/subject/chapter/topic/type/difficulty/marks/source/review/status | Questions have no section association/filter. **MEDIUM.** Define section-scoping semantics and add schema/API support if still required. |
| FR-18 | Paginated question/test APIs | IMPLEMENTED | list DTOs/services and E2E tests | — |
| FR-19 | Complete guided wizard contract and optional constraints | IMPLEMENTED | generation DTO, chapter-wide active-topic resolver, curriculum validator, unit expander, server-owned marks validation, persisted duration/repeat/retrieval constraints | PostgreSQL E2E verifies all-topic expansion and retrieval metadata; request bounds remain server controlled. |
| FR-20 | Async AI generation job | IMPLEMENTED | durable generation jobs/leases, BullMQ producer, independent AI worker, reconciliation | API creation commits PostgreSQL state before UUID-only dispatch; deterministic redelivery and database leases preserve idempotency. |
| FR-21 | Poll/subscribe status and partial results | IMPLEMENTED | job/items/retrieval polling plus authenticated `GET /ai/jobs/:jobId/events` SSE stream | SSE reuses owner-scoped status reads and closes after terminal state. |
| FR-22 | Per-question regeneration | IMPLEMENTED | regeneration endpoint/service, reservations, tests | — |
| FR-23 | Exact + embedding duplicate checks across batch/bank/recent tests | IMPLEMENTED | owner/topic-scoped bank candidates, recent-test snapshot window, normalized/Jaccard checks, embedding cosine checks, transactional pre-persistence gate | Candidate count and thresholds are server bounded; duplicate rejection uses stable `AI_DUPLICATE_REJECTED`. |
| FR-24 | Strict output validation and bounded malformed-item retries | PARTIAL | strict JSON/schema/citation validator; truncation/error tests | Schema/citation/count failures are not automatically regenerated per item; retries cover selected transient provider failures. **MEDIUM.** Add explicit bounded policy without hidden paid retries. |
| FR-25 | Manual test creation/selection | IMPLEMENTED | `TestsController/Service`; builder E2E | — |
| FR-26 | Mixed manual and AI assembly | IMPLEMENTED | common Question/TestQuestion path | — |
| FR-27 | Named test sections with instructions/marks/order | PARTIAL | global test instructions, marks snapshots, ordering | No section entity/title/instructions or grouping on `test_questions`. **HIGH.** Model immutable ordered test sections. |
| FR-28 | Reordering | IMPLEMENTED | `/tests/:id/questions/order`; transactional position logic | — |
| FR-29 | Paper and answer-key preview | IMPLEMENTED | `/tests/:id/preview`, `/answer-key`; render-model tests | — |
| FR-30 | Pre-finalization edit/add/remove/replace/order | IMPLEMENTED | test update/question mutation/refresh endpoints | — |
| FR-31 | DRAFT/GENERATED/FINAL/ARCHIVED lifecycle | IMPLEMENTED | `TestStatus` uses equivalent DRAFT/FINALIZED/ARCHIVED semantics and enforced transitions | — |
| FR-32 | Complete test history actions | PARTIAL | list/get/edit/clone/archive/export | No “regenerate test/configuration” operation and delete is archive-only by design. **MEDIUM.** Add explicit configuration regeneration if required. |
| FR-33 | Duplicate test | IMPLEMENTED | `/tests/:id/clone`; snapshot copying | — |
| FR-34 | A/B/C/D versions | DEFERRED | SRS Phase 2; `backend-decisions.md` | Explicit Phase 2 item. |
| FR-35 | Professional A4 PDF with examination metadata | IMPLEMENTED | `PdfLibRenderer`; PDF tests/real acceptance | — |
| FR-36 | Answer key/model answers/explanations | IMPLEMENTED | answer-key render mode and snapshot data | — |
| FR-37 | Authorized download/open/share/print | IMPLEMENTED | export create/list/get/download; private object storage | Backend supplies authorized download bytes; client owns OS share/print. |
| FR-38 | Full school branding/footer/logo | IMPLEMENTED | private validated logo upload; finalization-time branding snapshot; render-model/PDF tests | School name, logo, address, phone, email, website, and footer render from server-owned immutable branding. RTL/custom fonts are outside FR-38. |
| FR-39 | Excel/CSV/Word/JSON question import | DEFERRED | SRS Phase 2; project decision | Explicit Phase 2 item. |
| FR-40 | AI review gate | IMPLEMENTED | PENDING generated questions, approve endpoint, finalized-test eligibility | — |
| FR-41 | Server-enforced transactional quotas/ledger | IMPLEMENTED | entitlement/usage services, reservations/ledger, PostgreSQL E2E and real acceptance | — |
| FR-42 | Purchase, plan change, renewal, methods, webhook sync | PARTIAL | billing checkout/cancel/webhook/event/reconcile and Safepay adapter | Safepay lacks customer/portal/plan-change capabilities; live end-to-end validation is absent. **HIGH.** Complete required provider lifecycle and staging acceptance. |
| FR-43 | Teacher/school usage dashboard including storage | IMPLEMENTED | `GET /reports/usage`; current-cycle counters; document/PDF byte aggregation; tests | Teacher reports are self-scoped and School Admin reports are school-scoped. |
| FR-44 | School-admin shared curriculum/question bank publication | IMPLEMENTED | school teacher/curriculum APIs; centralized question visibility; moderation; Test Builder integration; audit/tests | Active approved manual and AI questions can be school-published; cross-school visibility is denied and finalized snapshots remain immutable. |
| FR-45 | Critical audit logging | IMPLEMENTED | `AuditService`; mutations across auth/curriculum/KB/generation/quota/tests/billing | — |
| FR-46 | Governed KB document management | IMPLEMENTED | KB controller/service, versions, rights, archive, tenant rules | — |
| FR-47 | Async ingestion through publication readiness | PARTIAL | durable ingestion jobs, leases, BullMQ producer/worker, scan/extract/chunk flow | Queue execution is implemented; embedding and publication remain separate governed actions rather than one uninterrupted async chain. **HIGH.** Complete the post-mapping orchestration where governance permits. |
| FR-48 | Extraction, headings/tables/OCR, provenance/confidence | PARTIAL | PDF/DOCX/TXT extractors and locators | OCR provider is `none`; table/heading/confidence fidelity is limited. **HIGH.** Add selected OCR provider and extraction-quality fixtures. |
| FR-49 | Configurable chunking and versioned pgvector embeddings | IMPLEMENTED | ingestion config; `content_chunk_embeddings`; embedding jobs/reindex | — |
| FR-50 | Validated/approved curriculum mappings | IMPLEMENTED | mapping validator, transitions, coverage and E2E | — |
| FR-51 | Publication lifecycle/PUBLISHED-only retrieval | IMPLEMENTED | lifecycle enums, preflight, retrieval SQL, archival tests | — |
| FR-52 | Filtered vector + PostgreSQL FTS retrieval/context budget | IMPLEMENTED | `RetrievalService`; context packing; pgvector/FTS migration and tests | Optional reranker remains intentionally absent. |
| FR-53 | Tenant/role/curriculum/language/publication/version isolation | IMPLEMENTED | SQL filters, scoped services, negative PostgreSQL tests | — |
| FR-54 | Delimited evidence-only grounded prompting | IMPLEMENTED | `GroundedPromptBuilder`; REQUIRED mode | — |
| FR-55 | Exact question citation persistence | IMPLEMENTED | `question_citations`; validation and real 3/3 provenance acceptance | — |
| FR-56 | REQUIRED no-charge plus approved PREFERRED fallback | PARTIAL | REQUIRED and zero-charge behavior implemented | Service rejects all non-REQUIRED modes; PREFERRED governance/fallback is absent. **MEDIUM.** Implement only after an explicit admin policy and labeling design. |
| FR-57 | Complete KB administration surface | PARTIAL | ingestion/readiness/preview/mapping/embed/reindex/publish/coverage/retrieval APIs | No range mapping, rollback/evaluation gate, or consolidated failure dashboard. **MEDIUM.** Add missing admin operations/report endpoints. |
| FR-58 | Teacher evidence/source-issue controls | PARTIAL | question grounding/citations and generation retrieval endpoints | Citation access is indirect; no source-issue report or same-vs-refreshed-evidence choice. **MEDIUM.** Add scoped citation detail and issue workflow. |
| FR-59 | Immutable versions and beside-active reindex | IMPLEMENTED | separate version/chunk/embedding rows; historical FK preservation; reindex service | — |
| FR-60 | Comprehensive RAG/document-access audit | PARTIAL | many KB/mapping/publication/retrieval actions audited | Citation/document reads and every scan/extraction/reindex/fallback event are not uniformly audited. **MEDIUM.** Define an event coverage matrix and instrument omissions. |

### Non-functional and operational requirements

| ID | Requirement | Status | Evidence | Missing / severity / recommended fix |
|---|---|---|---|---|
| NFR-01 | CRUD ~500 ms | PARTIAL | pagination/indexes | No representative performance evidence/SLO monitoring. **MEDIUM.** Add staging latency tests. |
| NFR-02 | Job submission ~1 s and async execution | IMPLEMENTED | durable creation followed by BullMQ dispatch; heavy processing in independent workers | Submission latency still requires deployed load validation, tracked separately under NFR-20. |
| NFR-03 | Retrieval p95 ≤1.5 s | PARTIAL | indexed retrieval; latency recorded | No high-cardinality p95 test. **MEDIUM.** Benchmark staging-sized data. |
| NFR-04 | Pagination and nonblocking long operations | PARTIAL | most main lists paginate; durable operations exist | Some admin/billing lists are unpaginated and processing endpoints remain synchronous. **MEDIUM.** Standardize pagination and enqueue. |
| NFR-05 | HTTPS, security middleware, CORS, rate limits | PARTIAL | Helmet/CORS/guards/throttler; deployment runbook | HTTPS/reverse proxy is operational, not deployed evidence. **HIGH operational.** Validate staging edge configuration. |
| NFR-06 | Server-side secret manager | PARTIAL | env validation and ignored `.env` | No deployed secret-manager integration evidence. **HIGH operational.** Configure protected staging/production injection and rotation. |
| NFR-07 | Secure uploads and DB constraints | IMPLEMENTED | validation/quarantine/scanner/limits/random keys/migrations/tests | — |
| NFR-08 | Pre-score tenant isolation and IDOR denial | IMPLEMENTED | scoped queries/services and negative E2E | — |
| NFR-09 | Prompt-input sanitization/injection corpus | IMPLEMENTED | `PromptInputSanitizer`; NFKC/control cleanup; escaped evidence delimiters; instruction hierarchy; adversarial delimiter/script/system/tool corpus | Evidence remains explicitly untrusted and cannot terminate its labelled source block. |
| NFR-10 | Graceful stable API errors | IMPLEMENTED | global exception filter/envelope and stable domain codes | — |
| NFR-11 | Bounded backoff/recovery | IMPLEMENTED | bounded BullMQ attempts/exponential backoff, PostgreSQL leases, provider retry limits, reconciliation | Circuit-breaker/telemetry depth remains tracked under NFR-17. |
| NFR-12 | Transactional quota under partial failure | IMPLEMENTED | reservations/settlement/ledger and concurrency E2E | — |
| NFR-13 | Checksum-aware idempotent ingestion/embedding | IMPLEMENTED | checksum uniqueness, claims, embedding config/content hashes | — |
| NFR-14 | Atomic publication preflight | IMPLEMENTED | publication service and PostgreSQL tests | — |
| NFR-15 | Immutable historical citations | IMPLEMENTED | restrictive FKs, snapshots, archival tests | — |
| NFR-16 | Independently scalable workers | IMPLEMENTED | four BullMQ processors, independent Nest application-context entry points, per-worker commands and bounded concurrency | API registers producers but no processors; `worker:all` remains available for controlled local operation. |
| NFR-17 | Circuit breakers and provider observability | NOT_IMPLEMENTED | timeouts/errors and token metadata only | No circuit breaker, metrics exporter, traces, or alert integration. **HIGH.** Add OpenTelemetry/metrics and provider health policy. |
| NFR-18 | Shadow reindex/evaluation/atomic switch/rollback | PARTIAL | parallel embedding configs and completeness checks | No evaluation gate, active-index switch abstraction, or rollback command. **HIGH.** Implement version activation workflow. |
| NFR-19 | Backup/recovery/retention | PARTIAL | documented pg_dump/object-storage procedure | No executed restore evidence, schedule, retention enforcement, or RPO/RTO. **HIGH operational.** Run staging restore drill. |
| NFR-20 | Required security/quality/load test breadth | PARTIAL | 175 unit and 29 DB E2E tests, queue producer/processor tests, adversarial prompt-input corpus, plus real AI acceptance | Missing live Redis replay/recovery, load, broader security corpus, signed-object, retrieval-quality regression, index rollback, and complete provider webhook acceptance suites. **HIGH.** Build staged test program. |

## 6. Authentication

Registration, case-insensitive login, Argon2 hashing, access JWTs, hashed refresh tokens, rotation/replay-family revocation, logout, logout-all, verification, reset, account-status checks, and password-change revocation are implemented. Public auth endpoints are throttled. The gap is profile-image management and incomplete audit coverage proof for every rejected security event.

## 7. Tenancy/RBAC

Global JWT, roles, and opt-in verified-email guards are registered in `AppModule`. KB SQL restricts SCHOOL data by `school_id`; teacher-owned questions/tests/jobs are scoped by actor, with SYSTEM_ADMIN overrides. Negative PostgreSQL tests cover significant cross-tenant paths. Gaps are school administration/seat lifecycle, shared school question ownership/publication, and the lack of database RLS as defense in depth.

## 8. Curriculum

Board → Class → Section and Class/Board → Subject → Chapter → Topic entities, uniqueness, active/archive states, hierarchy validation, CRUD, filtering and pagination are implemented. Mutations are SYSTEM_ADMIN-only, so SRS-delegated School Admin curriculum sharing is absent.

## 9. Question Bank

All five types, validation, ownership, approval, archive, options, marks, explanations, difficulty, provenance, pagination, filters, and generation-time embedding/history duplicate prevention exist. Gaps: section filtering, indexed full-text search, and explicit school-shared publishing.

## 10. Knowledge Base

The backend implements governed PDF/DOCX/TXT uploads, quarantine, signature/MIME checks, Defender integration, extraction, normalization, chunks, checksums, versioning, rights attestation, mapping review, readiness, publication and archive. OCR, high-fidelity table/heading/confidence extraction, range mappings, source-issue reporting, and automatic end-to-end job orchestration remain incomplete.

## 11. Embeddings/RAG

pgvector, the separate versioned `content_chunk_embeddings` table, dimension/model/config checks, jobs, idempotency, reindex, vector+FTS fusion, filters, context packing, RetrievalEvents and insufficient-knowledge behavior are implemented and tested. Evaluation-gated index activation/rollback, optional reranking, high-scale benchmarks, and PREFERRED fallback are gaps.

## 12. AI Generation

Request validation, chapter-wide topic expansion, target/retrieval/repeat constraints, grounded and sanitized prompts, provider abstraction, OpenRouter strict JSON Schema, token ceilings, explicit truncation, schema/citation validation, durable jobs, polling/SSE progress, regeneration, cancellation, quota settlement, text/embedding/history duplicate checks, BullMQ dispatch, and an independent worker exist. Automatic invalid-item retry policy remains incomplete.

## 13. Test Builder

Draft creation, mixed question selection, ordering, removal, snapshot refresh, preview, answer key, finalization, immutability, clone and archive exist with PostgreSQL tests. Named sections and section-specific instructions/grouping do not exist. “Regenerate from prior configuration” is not exposed.

## 14. PDF

The renderer creates A4 paginated question papers and answer keys from immutable snapshots, with marks, global instructions, answer space, correct answers/explanations, hashing, cached exports, private storage, authorized downloads and quota idempotency. It renders institution name and academic metadata, but not logo/address/contact/footer. Helvetica fallback replaces unsupported characters, so Urdu/Arabic/RTL/custom fonts are unsupported.

## 15. Subscriptions/Quota

Plans, individual/school subscriptions, billing periods, pooled school resolution, AI/TEST/PDF metrics, reservations, settlement/release, expiration and immutable usage ledger are implemented transactionally. Storage use is not charged, default Free/Pro/School commercial seeds are not demonstrated, and dashboard aggregation is limited.

## 16. Billing/Safepay

Checkout, signed raw-body webhooks, idempotent event processing, transaction persistence, cancellation, plan-provider mappings, event retry and reconciliation foundations exist with deterministic tests. Safepay is implemented but live/sandbox acceptance remains operationally unvalidated. Its declared capabilities omit customer creation, payment-method portal and plan change; failed-payment downgrade-at-cycle-end/warning behavior is incomplete.

## 17. Notifications

Persistent notifications, preferences, encrypted email template payloads, SMTP provider verification, leased delivery worker, retry/idempotency and key auth/generation/test/PDF/billing event types exist. Real SMTP is optional/unconfigured, and no WebSocket/push channel exists. SRS §4.3 labels general notification/collaboration as future, but transactional notifications were implemented early.

## 18. Administration

SYSTEM_ADMIN endpoints exist for curriculum, plans/subscriptions, billing events/mappings/reconciliation, KB governance, embedding/retrieval and notification operations. There are no user/school/teacher management controllers, seat administration, platform analytics, general audit-log query API, or AI/prompt/retrieval configuration administration. SCHOOL_ADMIN can govern school KB content but cannot manage teachers or publish a shared question bank.

## 19. Reporting/Analytics

Only current subscription usage, KB coverage, job/retrieval status, billing transactions/events, and notification counts are exposed. There are no teacher activity, generated test/question statistics, school rollups, question reuse, topic/difficulty analytics, platform metrics, cost dashboards, or downloadable reports. Raw tables are not an implemented reporting API.

## 20. Security

Implemented controls include Argon2, hashed/rotating tokens, status checks, global RBAC/JWT/validation/throttling, Helmet, explicit CORS, tenant predicates, upload quarantine/scanning, raw-body webhook signatures, encrypted notification template data, prompt-input normalization and escaped evidence delimiters, server-held provider keys, private local storage and safe provider errors. Gaps include operational TLS/secrets proof, dedicated signed URL design (downloads are API-authorized streams), systematic security-event audit coverage, secret/log scanning automation, and circuit breakers.

## 21. Non-Functional Requirements

Configuration bounds, indexes, leases, checksums, idempotency, graceful shutdown, queue reconciliation, independent consumers, and health endpoints provide a good reliability base. No evidence yet proves stated latency, scale, availability, backup, restore, retention, observability, worker supervision, or RPO/RTO goals in a deployed environment.

## 22. Endpoint Inventory

All paths are under `/api/v1`. Unless marked Public, JWT is required. `V` means the controller requires verified email; role lists are explicit controller decorators. Endpoints without a role decorator allow any authenticated role.

| Module | Endpoints | Roles / purpose |
|---|---|---|
| Auth | `POST auth/register`, `login`, `refresh`, `logout`, `verify-email`, `forgot-password`, `reset-password`; `POST auth/logout-all`; `GET auth/me` | First seven Public (token-bearing where applicable); last two authenticated. Identity/session lifecycle. |
| Users | `GET users/me`; `PATCH users/me`, `me/password` | Authenticated; own profile/password. |
| Boards | `GET boards`, `boards/:id`; `POST/PATCH/DELETE boards...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Classes | `GET classes`, `classes/:id`; `POST/PATCH/DELETE classes...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Sections | `GET sections`, `sections/:id`; `POST/PATCH/DELETE sections...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Subjects | `GET subjects`, `subjects/:id`; `POST/PATCH/DELETE subjects...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Chapters | `GET chapters`, `chapters/:id`; `POST/PATCH/DELETE chapters...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Topics | `GET topics`, `topics/:id`; `POST/PATCH/DELETE topics...` | Reads authenticated; mutations SYSTEM_ADMIN. |
| Questions V | `POST/GET questions`; `GET/PATCH/DELETE questions/:id`; `POST questions/:id/approve` | TEACHER/SYSTEM_ADMIN mutate; SCHOOL_ADMIN has scoped reads. |
| AI V | `POST ai/tests/generate`, `jobs/:id/process`, `jobs/:id/items/:itemId/regenerate`; `GET ai/jobs/:id`, `/items`, `/retrieval`; `DELETE ai/jobs/:id` | TEACHER, SCHOOL_ADMIN, SYSTEM_ADMIN; create/process/poll/regenerate/cancel. |
| Tests | `POST/GET tests`; `GET tests/:id`, `/preview`, `/answer-key`; `PATCH tests/:id`; `POST .../questions`, `/questions/bulk`, `/finalize`, `/clone`; `PATCH .../questions/order`; `POST .../questions/:id/refresh`; `DELETE .../questions/:id`, `tests/:id` | TEACHER, SCHOOL_ADMIN, SYSTEM_ADMIN; tenant/owner scoped builder. |
| Test exports | `POST/GET tests/:testId/exports`; `GET .../:exportId`, `.../:exportId/download` | TEACHER, SCHOOL_ADMIN, SYSTEM_ADMIN; create/cache/read/download. |
| KB V | `GET kb/coverage`, `/documents`, `/documents/:id`, document versions/mappings/readiness/preview/chunks; `POST/PATCH/DELETE` documents/versions/mappings/review/publish | Reads vary; governance SYSTEM_ADMIN/SCHOOL_ADMIN; teacher reads are tenant scoped. |
| Ingestion V | `GET kb/ingestion-jobs/:id`; `POST .../:id/scan`, `/retry`, `/process` | Read includes teacher; processing SYSTEM_ADMIN/SCHOOL_ADMIN. |
| Embeddings V | `POST kb/document-versions/:id/embed`, `/embeddings/reindex`, `embedding-jobs/:id/retry`; `GET .../:id/embeddings` | Admin operations; teacher may inspect authorized embedding status. |
| Retrieval V | `POST kb/retrieval/preview`; `GET kb/retrieval-events/:id` | SYSTEM_ADMIN/SCHOOL_ADMIN only. |
| Subscription | `GET subscription`, `/usage` | TEACHER/SCHOOL_ADMIN; own or pooled subscription. |
| Admin subscriptions | `GET/POST/PATCH admin/plans`; `POST/PATCH admin/subscriptions`; `POST admin/usage/expire` | SYSTEM_ADMIN. |
| Billing | `POST billing/checkout`, `/subscription/cancel`; `GET billing/transactions`; `POST billing/webhooks/:provider` | Teacher/School Admin except signed Public webhook. |
| Admin billing | `GET admin/billing/events`, `/plan-prices`; `POST .../events/:id/retry`, `/reconcile`, `/plan-prices` | SYSTEM_ADMIN. |
| Notifications | `GET notifications`, `/unread-count`, `/preferences`; `PATCH notifications/:id/read`, `/preferences`; `POST notifications/read-all` | Authenticated self scope. |
| Admin notifications | `POST admin/notifications/process`, `/deliveries/:id/retry`, `/smtp/verify` | SYSTEM_ADMIN. |
| Health | `GET health/live`, `health` | Public; liveness and safe readiness summary. |

Notable SRS endpoint gaps: school/user administration, `/usage/me` alias, direct question citations, source-issue reporting, version archive, dedicated KB range mapping, audit log browsing, reporting/analytics, payment-method portal/plan change, and asynchronous enqueue-only workflow semantics.

## 23. Database Inventory

| Domain | Important tables/entities |
|---|---|
| Identity/organization | `users`, `schools`, `auth_tokens` |
| Curriculum | `boards`, `classes`, `sections`, `subjects`, `chapters`, `topics` |
| Questions | `questions`, `question_options`, `question_citations` |
| KB/ingestion | `knowledge_documents`, `document_versions`, `ingestion_jobs`, `content_chunks`, `document_topic_mappings` |
| Embedding/RAG | `content_chunk_embeddings`, `embedding_jobs`, `retrieval_events`, `retrieval_event_chunks` |
| AI | `generation_jobs`, `generation_job_items` |
| Subscription/usage | `plans`, `subscriptions`, `usage_counters`, `usage_reservations`, `usage_ledger` |
| Tests/PDF | `tests`, `test_questions`, `test_exports` |
| Billing | `plan_provider_prices`, `billing_customers`, `billing_checkout_sessions`, `billing_events`, `billing_transactions` |
| Notifications | `notifications`, `notification_deliveries`, `notification_preferences` |
| Audit | `audit_logs` |

The model strongly supports current grounded-generation provenance and immutable test rendering. Missing data-model capabilities include test sections, school-shared question-bank governance, source-issue reports, reporting aggregates, provider configuration/prompt-template records, and explicit index activation/evaluation state. The SRS’s simplified inline chunk embedding was correctly normalized into `content_chunk_embeddings` to preserve versions.

## 24. Test Coverage Matrix

| Area | Evidence | Assessment |
|---|---|---|
| Authentication/security | auth/security PostgreSQL E2E, guard tests | Strong core; broader security-event/log-redaction testing needed. |
| Curriculum | CRUD/hierarchy DTO and PostgreSQL E2E | Strong. |
| Questions | validator, DTO and PostgreSQL E2E | Strong manual path; duplicate/search scale gaps. |
| KB/ingestion | unit extraction/chunking/malware plus PostgreSQL E2E | Good foundation; OCR/malicious corpus/recovery breadth missing. |
| Embeddings/retrieval | provider mocks, pgvector E2E, deterministic retrieval/context tests | Strong correctness; quality/load/index rollback missing. |
| AI generation | provider/strict-output/unit/PostgreSQL E2E and real manual acceptance | Strong synchronous service path; queue/recovery/load missing. |
| Quotas/subscriptions | unit + concurrency-aware PostgreSQL E2E | Strong. |
| Tests/PDF | builder/PDF unit and PostgreSQL E2E, real PDF acceptance | Strong snapshots/idempotency; sections/branding/RTL missing. |
| Billing | deterministic/Safepay adapter unit tests | Application foundation strong; real sandbox/webhook lifecycle unvalidated. |
| Notifications | crypto/template/SMTP provider tests | Good; no live SMTP acceptance. |
| Operations | guarded real-AI validation and manual workflow | No deployed staging, load, restore, telemetry or failure-drill evidence. |

## 25. Backend Feature Gaps

Distinct feature gaps (overlapping requirements consolidated):

1. **IMPLEMENTED — asynchronous workers:** BullMQ producers/processors, reconciliation, and independent entry points cover the four long-running domains.
2. **HIGH — school administration/sharing:** no teacher-seat, school profile, shared curriculum/question-bank governance APIs.
3. **IMPLEMENTED — generation contract:** server validates and persists target/repeat/retrieval and all-topic constraints.
4. **IMPLEMENTED — duplicate policy:** normalized text and embedding comparison covers the batch, owner bank, and configured recent-test window.
5. **HIGH — test sections:** no section model/grouped instructions.
6. **HIGH — billing lifecycle:** plan change/payment method and failed-cycle downgrade behavior incomplete.
7. **HIGH — usage/reporting:** storage accounting and teacher/school/platform analytics absent.
8. **HIGH — PDF branding/i18n:** incomplete school fields/logo/footer and no RTL/custom font support.
9. **HIGH — OCR/extraction quality:** no active OCR provider and limited table/confidence behavior.
10. **MEDIUM — question FTS/section filter.**
11. **MEDIUM — invalid-item retry and progress streaming.**
12. **MEDIUM — PREFERRED grounding governance.**
13. **MEDIUM — KB range mapping, evaluation rollback and consolidated failure views.**
14. **MEDIUM — teacher citation/source-issue controls.**
15. **MEDIUM — complete RAG/document-read audit coverage.**
16. **MEDIUM — profile image workflow.**
17. **LOW — route naming/status vocabulary differs from illustrative SRS contracts but is internally consistent.**

## 26. Operational Gaps

1. Dedicated staging deployment/database/object storage is not configured or evidenced.
2. HTTPS/load balancer/reverse-proxy behavior is documented but not validated.
3. Protected secret injection and rotation are not operationally evidenced.
4. Real staging malware scanner selection is unresolved outside the validated Windows workstation.
5. Safepay sandbox/live end-to-end validation is pending.
6. SMTP credentials and delivery acceptance are pending.
7. Monitoring, metrics, tracing, dashboards and alerts are not deployed.
8. Backup schedule, retention, restore drill and RPO/RTO are not validated.
9. High-cardinality load, recovery, queue replay and provider-failure drills do not exist.

## 27. Deferred Items

- FR-34 multiple A/B/C/D test versions — Phase 2.
- FR-39 Excel/CSV/Word/JSON question import — Phase 2.
- OCR/multimodal depth is partly MVP-conditional (“when OCR is enabled”) and advanced multimodal support is Phase 2; selecting a real OCR provider remains deferred but scanned-PDF acceptance cannot be claimed meanwhile.
- Advanced analytics, retrieval experiments, student delivery, marketplace, collaboration and offline behavior are explicitly later-phase scope, but basic FR-43 usage reporting remains an MVP gap.

## 28. Launch Blockers

### BACKEND_LAUNCH_BLOCKERS

- No remaining backend requirement is classified BLOCKER. Deployment still requires a real Redis integration/recovery exercise and worker supervision before production acceptance.

Before production (but not before an isolated engineering staging deployment), payment lifecycle completion/validation, staging tenant/security checks, real scanner/storage/secrets, and restore/observability readiness are also mandatory.

## 29. Prioritized Remaining Work

- **P0 — before representative staging:** deploy Redis and independent workers, validate live enqueue/consume/replay/shutdown behavior, and add process supervision/worker-staleness monitoring.
- **P1 — product completion before production:** test sections and bounded malformed-item retries; then ingestion/OCR completeness, payment lifecycle, monitoring/tracing, secrets/TLS, backup restore, adversarial tenant/load tests, and production scanner/storage.
- **P2 — subsequent product batches:** test sections, usage/reporting APIs, KB source issues/range mapping/evaluation rollback, full audit coverage, and profile image.
- **P3 — deferred/optional:** multiple versions, imports, advanced analytics/reranking, OCR/multimodal expansion, advanced branding and RTL fonts.

## 30. Final Verdict

**D. BACKEND HAS MAJOR FEATURE GAPS**

The core application services are unusually complete and well-tested, and school governance, reporting, and immutable PDF branding now satisfy this selected batch. However, SRS traceability—not module count—controls this verdict: test sections, ingestion/OCR completeness, billing lifecycle, and several operationally essential behaviors remain material. The next cohesive product batch should implement test sections and bounded malformed-item regeneration.
