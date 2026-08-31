# Backend implementation plan

## Responsibilities and scope

The NestJS modular monolith owns authentication, RBAC, users/schools, curriculum, questions/tests, asynchronous AI generation, governed Knowledge Base ingestion, hybrid retrieval and citations, subscriptions/usage/payments, PDF jobs, audit, storage, and operational health. PostgreSQL is the source of truth; pgvector and full-text search serve retrieval; Redis/BullMQ serves asynchronous work.

The foundation implements configuration, HTTP/security conventions, PostgreSQL migrations, Redis queue registration, identity, schools, token-based authentication, RBAC, tenant context, audit persistence, health, Swagger, and external-provider contracts. The completed curriculum phase adds production CRUD APIs, hierarchy validation, pagination/filtering/safe sorting, archive lifecycle, transactional audits, verified-email policy, and database-backed integration coverage. It deliberately does not implement feature-complete question/test, RAG, ingestion/OCR, AI, PDF, billing, or school-owned curriculum workflows.

## Domain and dependency graph

`Common/Config → Database + Infrastructure → Identity (Schools, Users, Auth) → Curriculum`.

Future application modules depend inward on identity/curriculum and provider contracts: `KB → Ingestion`; `KB → Retrieval`; `Retrieval + Entitlements → AI Generation → Questions`; `Questions → Tests → PDF`; `Plans → Subscriptions → Usage`; `Payments → Subscriptions`. Audit is an append-only cross-cutting port, not a business dependency back into callers.

Database ownership follows those module boundaries. Cross-module references use UUIDs/contracts; transactions coordinate multi-domain invariants. Foundational tables are schools, users, auth_tokens, boards, classes, sections, subjects, chapters, topics, and audit_logs. Future tables listed by SRS §23 remain deferred.

## Workers and integrations

Separate BullMQ queues define `knowledge-ingestion`, `embedding`, `ai-generation`, and `pdf-generation`. Workers will be independently deployable entry points while importing unchanged application contracts. AI generation, embeddings, object storage, email, and payments are ports with vendor adapters supplied later. OCR and malware scanning also require provider/tool decisions.

## Security and tenancy

JWT authentication resolves a server-side user record and rejects suspended/deleted users. Refresh, verification, and password-reset secrets are random opaque tokens stored only as hashes, with expiry, consumption, rotation, per-session revocation, and all-device revocation. RBAC uses typed roles and guards.

School-private records must carry `school_id`; repositories require a `TenantContext` and default-deny missing tenant scope. System administrators can use an explicit global context. PostgreSQL RLS is recommended as defence in depth once tenant-owned KB/question/test schemas land. RAG must filter GLOBAL plus the caller's school, publication/version, curriculum, language, and role before vector/full-text scoring; citation/object access repeats ownership checks.

## RAG, question/test, and subscription boundaries

Knowledge Base owns immutable versions, mappings, chunks and publication. Retrieval alone selects published evidence and records events. AI Generation owns jobs/prompts/provider validation. Questions owns review and citations; Tests owns assembly and PDFs. This prevents generation from bypassing retrieval and preserves historical citations.

Entitlements answer whether an operation is allowed; Usage performs transactional, race-safe reservations/settlement; Payments synchronizes subscription state from idempotent verified webhooks. `INSUFFICIENT_KNOWLEDGE` settles zero accepted AI questions.

## Phase 2/future exclusions

No student test taking/grading/analytics, A/B/C/D versions, bulk question import, marketplace, advanced analytics/retrieval experiments, multimodal ingestion, collaboration, or offline generation is included.

## Suggested order

1. Foundation and identity/curriculum (this phase).
2. Curriculum CRUD with tenant/RBAC tests. (complete)
3. Manual question bank and review constraints. (complete)
4. KB upload/storage/quarantine and ingestion jobs. (secure-source foundation complete; processing deferred)
5. Deterministic extraction and locator-preserving chunks. (complete; ends at READY_FOR_MAPPING)
6. Curriculum mapping, review readiness, preview, metadata coverage, and guarded publication preflight. (complete; publication blocked honestly)
7. Integrate real malware scanning with persistent states and production gate. (Windows Defender complete; OCR deferred)
8. Implement embeddings/pgvector and guarded publication preflight. (embedding foundation complete; activation remains deferred)
9. Implement atomic publication and hybrid retrieval with PostgreSQL FTS, pgvector cosine similarity, curriculum/tenant filters, context packing, and RetrievalEvents. (complete and validated against local PostgreSQL 17.10 + pgvector 0.8.6)
10. Grounded asynchronous AI generation jobs, evidence-bound prompts, strict output/citation validation, pending-review Question persistence, exact duplicate protection, and item regeneration. (complete; deterministic provider validated, live OpenAI model not configured)
11. Entitlements, transactional usage reservation/settlement, subscriptions, and quotas. (complete)
12. Persisted Test Builder, immutable snapshots, lifecycle, preview/answer-key render models, and transactional TESTS quota. (complete; PDF deferred)
13. Immutable question-paper/answer-key PDF rendering, secure storage/download, export history, and PDF_EXPORTS accounting. (complete)
14. Payment adapters, webhook synchronization, and production hardening.

# Billing foundation

- [x] Provider-neutral contracts and deterministic signed test adapter
- [x] Trusted plan-price mapping, billing ownership, checkout idempotency
- [x] Raw-body signature verification and durable idempotent event processing
- [x] Subscription synchronization, stale-event protection, transaction history
- [x] Admin event/retry/mapping/reconciliation endpoints
- [x] Select and implement the supported Safepay production adapter surface
- [x] Select Safepay and implement hosted subscription checkout, cancellation, HMAC webhooks, and normalized events
- [ ] Configure Safepay sandbox credentials and run opt-in connectivity/webhook validation
- [ ] Obtain an official documented subscription retrieval API before enabling Safepay reconciliation
