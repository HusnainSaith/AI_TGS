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
6. Malware/OCR provider integration, curriculum mapping, embeddings, publication and hybrid retrieval.
7. Entitlements/usage, then grounded AI jobs and duplicate detection.
8. Test builder/PDF, followed by payment adapters and hardening.
