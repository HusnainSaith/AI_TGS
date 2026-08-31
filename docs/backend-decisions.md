# Backend decisions

| Status                | Decision / assumption                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONFIRMED_FROM_SRS    | NestJS REST modular monolith, `/api/v1`, PostgreSQL + pgvector, Redis/BullMQ, UUIDs, `timestamptz`, migrations, provider abstractions.                                                        |
| ENGINEERING_DECISION  | TypeORM is the single ORM because the request prefers it and no repository convention exists. Schema synchronization is disabled.                                                             |
| ENGINEERING_DECISION  | `auth_tokens` persists only SHA-256 token digests and supports refresh rotation/reuse revocation, verification/reset expiry, logout, and logout-all.                                          |
| ENGINEERING_DECISION  | Argon2id hashes passwords. Authentication reloads user status instead of trusting token claims for authorization.                                                                             |
| ENGINEERING_DECISION  | Curriculum is global in Phase 1, matching the SRS schema. Tenant-owned private domains will require `school_id` and scoped repositories, with RLS as defence in depth.                        |
| ENGINEERING_DECISION  | Queue connections are registered only outside test mode; provider secrets remain optional until their adapter is invoked.                                                                     |
| CONFIRMED_FROM_USER   | Global curriculum mutations are SYSTEM_ADMIN-only. SCHOOL_ADMIN and TEACHER are verified-email read-only roles. School-owned curriculum is deferred pending a coherent ownership/scope model. |
| NEEDS_CONFIRMATION    | Whether school-less teachers may access global curriculum and KB only, and how a teacher joins/creates a school.                                                                              |
| CONFIRMED_FROM_USER   | Login may issue tokens to unverified users, but reusable `RequireVerifiedEmail` policy protects curriculum and future normal business endpoints. Verification endpoints remain reachable.     |
| DEFERRED              | Registration does not create a Free subscription until subscription/entitlement implementation.                                                                                               |
| ENGINEERING_DECISION  | Curriculum DELETE endpoints archive using a dedicated ACTIVE/ARCHIVED status. No curriculum hard-delete API exists; foreign keys use RESTRICT to prevent destructive tree cascades.           |
| ENGINEERING_DECISION  | Curriculum logical names are trimmed and protected by case-insensitive expression indexes within their hierarchy. Archived names remain reserved for stable historical references.            |
| ENGINEERING_DECISION  | Core relational migrations and optional RAG migrations are separate. Missing pgvector cannot block identity/curriculum development and produces an actionable error.                          |
| NEEDS_CONFIRMATION    | Preferred payment, email, object-storage, AI, embedding, OCR, and malware-scanning providers.                                                                                                 |
| DEFERRED_TO_RAG_PHASE | Embedding dimensionality (`vector(n)`) and model migration strategy require a selected embedding provider/model.                                                                              |
| FUTURE_SCOPE          | Student workflows, multiple test versions, imports, marketplace, advanced analytics/retrieval experiments, multimodal OCR, collaboration, and offline generation.                             |

## Manual Question Bank decisions

- `ENGINEERING_DECISION`: Public creation always stamps `MANUAL`, `APPROVED`, `NOT_APPLICABLE`, nullable generation/retrieval references, and server-derived ownership. Future AI uses the same tables through an internal path.
- `ENGINEERING_DECISION`: TRUE_FALSE uses exactly two `TRUE`/`FALSE` option rows with one correct row. Transactional domain validation enforces cross-row cardinality; PostgreSQL enforces row shape and unique order.
- `ENGINEERING_DECISION`: FILL_BLANK expected/model answers use nullable `explanation`; no multi-answer engine is introduced.
- `ENGINEERING_DECISION`: Teachers access only their own bank. SCHOOL_ADMIN receives no implicit private-bank visibility; sharing awaits an explicit Phase 2 ownership model. SYSTEM_ADMIN has moderation scope.
- `ENGINEERING_DECISION`: Question DELETE archives. Curriculum FKs use RESTRICT; option CASCADE is limited to controlled child replacement/future physical cleanup.
- `ENGINEERING_DECISION`: Exact duplicates are rejected per owner and active Topic after whitespace/case normalization. Similarity checks remain deferred.
- `ENGINEERING_DECISION`: Section is test/generation context and is not stored on Question. Topic remains the smallest content scope.
- `ENGINEERING_DECISION`: Search currently uses parameterized ILIKE across question content and bounded curriculum joins. PostgreSQL FTS optimization is deferred until justified by measured volume.

## Knowledge Base secure-source decisions

- `ENGINEERING_DECISION`: Metadata creation and immutable multipart version upload are separate. `active_version_id` means the published retrieval version and remains null until a future guarded publication workflow exists.
- `ENGINEERING_DECISION`: SYSTEM_ADMIN creates GLOBAL sources; SCHOOL_ADMIN creates/manages only SCHOOL sources for its authenticated school. Teachers are read-only. Queries apply GLOBAL/current-school scope before returning documents, versions, or jobs.
- `ENGINEERING_DECISION`: Rights JSONB requires `permissionConfirmed: true` and a source owner at DTO level; PostgreSQL also enforces the attestation. PATCH cannot alter scope, school, creator, active version, or lifecycle.
- `ENGINEERING_DECISION`: The local provider writes generated UUID keys below `quarantine/<scope>/...`; normalized path checks prevent root escape. Quarantine is not statically served.
- `ENGINEERING_DECISION`: PDF uses `%PDF-`; DOCX requires ZIP and OOXML markers; TXT rejects NUL/binary-heavy content and common executable headers. This is spoofing validation, not parsing or malware scanning.
- `ENGINEERING_DECISION`: SHA-256 identifies bytes. A unique constraint rejects the same checksum within one logical document; duplicates across authorized documents/tenants remain allowed.
- `ENGINEERING_DECISION`: A per-document PostgreSQL advisory transaction lock serializes version numbering. If the database transaction fails after storage succeeds, compensating deletion removes the object.
- `ENGINEERING_DECISION`: Uploads create `QUEUED` jobs at `SIGNATURE_VALIDATION`, extraction `PENDING`, malware `NOT_SCANNED`, and `queueDispatched:false`. Redis is optional; retry is FAILED-only and capped at three.
- `DEFERRED`: ADMIN_NOTE content ingestion, raw download, real scanner/OCR adapters, embeddings, mappings, publication, and retrieval.

## Knowledge ingestion processing decisions

- `ENGINEERING_DECISION`: `IngestionProcessorService.processJob` is the single processing implementation for the administrative no-Redis endpoint and future BullMQ workers. PostgreSQL atomically claims QUEUED or stale PROCESSING jobs with a UUID lease token; final persistence requires the same token.
- `ENGINEERING_DECISION`: `pdfjs-dist` provides public page APIs and preserves real PDF page numbers. A PDF is OCR-required when it has no text or its below-threshold page ratio exceeds `KB_PDF_MAX_EMPTY_PAGE_RATIO`.
- `ENGINEERING_DECISION`: Mammoth's stable HTML conversion preserves DOCX headings and ordered paragraphs. Its HTML is never served; text is decoded into `DOCX_PARAGRAPH` locators. DOCX page numbers are never invented.
- `ENGINEERING_DECISION`: UTF-8 TXT extraction normalizes line endings and preserves deterministic `TEXT_LINES` ranges. NUL or invalid UTF-8 input fails safely.
- `ENGINEERING_DECISION`: Conservative normalization uses NFC, removes non-meaningful controls, normalizes line endings/horizontal whitespace, and collapses excessive blank lines without paraphrasing.
- `ENGINEERING_DECISION`: Chunking groups source blocks toward a configurable token-estimate target, splits oversized blocks only at words, carries bounded overlap, and preserves merged source locators. SHA-256 hashes normalized content; ordering begins at one and is database-unique per version.
- `ENGINEERING_DECISION`: Token counts use `ceil(characters / 4)` as an explicitly approximate, provider-neutral estimate until an embedding/LLM tokenizer is selected.
- `ENGINEERING_DECISION`: Successful extraction sets DocumentVersion `COMPLETED`, KnowledgeDocument `READY_FOR_MAPPING`, and the broad pipeline job `AWAITING_MAPPING`. Mapping, embedding, publication, and retrieval have not occurred.
- `ENGINEERING_DECISION`: Reprocessing atomically replaces chunks for the immutable version. Completeness verifies non-empty text/chunks, contiguous order, hashes, locators, size ceilings, and plausible aggregate coverage.
- `SECURITY_DECISION`: Scanner and OCR defaults are unconfigured and never fabricate results. Production cannot enable unscanned processing; controlled development/test fixtures may process while retaining malware `NOT_SCANNED`. OCR-required PDFs fail until a real provider exists.

## Publication and hybrid retrieval decisions

- `ENGINEERING_DECISION`: Publication is serializable and row-locks the document/version, re-runs the shared readiness preflight, snapshots approved mapping IDs plus the active embedding config, then atomically switches `active_version_id`. Published mappings are immutable.
- `ENGINEERING_DECISION`: New retrieval uses only the logical document's active published version. Archived documents/versions immediately leave new candidate sets; historical RetrievalEvent evidence remains retained.
- `ENGINEERING_DECISION`: Retrieval-specific FTS and provenance schema lives in the independent RAG migration chain. English uses an `english` generated tsvector; other languages use `simple`.
- `ENGINEERING_DECISION`: Vector score means cosine similarity (`1 - pgvector cosine distance`). Keyword score is `ts_rank_cd / (ts_rank_cd + 1)`. `hybrid-v1` normalizes configured weights and combines both scores.
- `ENGINEERING_DECISION`: Tenant, publication, active-version, approved-mapping, curriculum, language, document selection, active embedding config/status/hash, and CLEAN/extraction predicates execute before bounded vector/keyword candidate scoring.
- `ENGINEERING_DECISION`: Exact content hashes are unique per result. Highly-overlapping adjacent chunks from one version are suppressed at an 0.8 token-set overlap threshold; useful adjacent evidence remains eligible.
- `ENGINEERING_DECISION`: Context packing preserves rank and whole chunks within the evidence token budget and assigns stable `SRC_1...SRC_n` labels. It never truncates content.
- `ENGINEERING_DECISION`: RetrievalEventChunk is normalized rather than JSON-only, retaining immutable rank, scores, content hash, and locator snapshot for later citation linkage.
- `DEFERRED`: ANN indexes and reranking.
- `VALIDATION`: PostgreSQL 17.10 on Windows was extended in place with official pgvector v0.8.6 built using Visual Studio Build Tools 2022/MSVC x64. No second server or service restart was required; core and RAG migrations, vector dimension/cosine checks, indexed FTS, atomic publication, hybrid retrieval, tenant isolation, archival retention, and insufficient-knowledge behavior passed against real PostgreSQL.

## Grounded AI generation decisions

- `ENGINEERING_DECISION`: A GenerationJob expands deterministically into one item per Topic + QuestionType + Difficulty. An item may persist multiple questions; `questions.generation_job_item_id` preserves that lineage while the item's legacy-compatible `question_id` points to its first result.
- `SECURITY_DECISION`: MVP grounding mode is REQUIRED only. Each item creates its own RetrievalEvent, and insufficient retrieval never invokes the generation provider or creates a Question.
- `SECURITY_DECISION`: `GroundedPromptBuilder` treats delimited SOURCE blocks as untrusted data and explicitly forbids following source instructions, tool/secret requests, system-prompt disclosure, and unsupported external facts.
- `ENGINEERING_DECISION`: Provider output is strict JSON. Server validation enforces exact count/type/difficulty/marks, existing option rules, and citations limited to labels selected by the item's RetrievalEvent.
- `ENGINEERING_DECISION`: AI questions are always server-stamped AI_GENERATED, PENDING, ACTIVE, and GROUNDED only after evidence validation. Citation locator/hash/score values are copied from RetrievalEventChunk snapshots, never from model-authored provenance.
- `ENGINEERING_DECISION`: Server-controlled marks are MCQ/TRUE_FALSE/FILL_BLANK=1, SHORT=2, LONG=5. Exact normalized duplicates are rejected against both the current transaction and the owner's active Question Bank; near-duplicate detection remains an explicit future interface.
- `ENGINEERING_DECISION`: PostgreSQL processing tokens and expiring leases make job/item claims recoverable without Redis. Token counts and request count are accumulated; monetary cost remains null because pricing is not configured.
- `ENGINEERING_DECISION`: Regeneration creates a new RetrievalEvent and new Question/citations while preserving prior questions. DELETE is cancellation state, not physical deletion, and cannot cascade into question or citation history.
- `ENGINEERING_DECISION`: Subscriptions follow the SRS dual-owner model: exactly one of user (Free/Pro) or school (pooled School plan). No implicit Free row or commercial pricing is seeded; administration assigns subscriptions until payment synchronization exists.
- `ENGINEERING_DECISION`: ACTIVE and TRIALING are entitled within UTC `[currentPeriodStart,currentPeriodEnd)`; other states, expired periods, and inactive plans are denied. Plan-limit `null` alone means unlimited and zero means no capacity.
- `ENGINEERING_DECISION`: Period counters preserve history and split settled `used` from temporary `reserved`. Reservation locks the counter after conflict-safe creation; settlement locks reservation then counter and counts persisted AI-generated Questions. Unique references plus append-only ledger entries make reservation and settlement idempotent and crash-recoverable.
- `ENGINEERING_DECISION`: Initial job reservation is transactional with job creation. Terminal/cancel paths settle persisted Questions and release unused capacity. PENDING persisted Questions are charged; insufficient knowledge, rejected invalid/duplicate output, and provider failure charge zero. Each deliberate regeneration attempt reserves incremental capacity.
- `ENGINEERING_DECISION`: PostgreSQL expiry skips GenerationJobs with a valid processing lease. External retrieval/provider calls never occur inside usage transactions. Payment providers and webhooks remain deferred.

## Persisted Test Builder

- `DOMAIN_DECISION`: Question is reusable mutable bank content; TestQuestion is a self-contained historical snapshot. A restrictive source FK remains for traceability, but paper and answer-key rendering never require current Question content.
- `ENGINEERING_DECISION`: Snapshots are captured on DRAFT add and change only through explicit refresh. Finalization revalidates source status, ownership, curriculum, and AI approval without silently refreshing content. Later source edits/archive cannot change a finalized Test.
- `SECURITY_DECISION`: PENDING AI Questions may enter a draft, but finalization requires APPROVED AI Questions. Preview strips correct-answer flags, model answers, and explanations; the authorized answer-key endpoint uses frozen snapshots.
- `ENGINEERING_DECISION`: Draft creation/edit/clone costs zero. Finalization consumes exactly one `TESTS` unit through shared UsageService and unique `TEST_FINALIZATION` reference. Retry is idempotent, failure charges zero, archive does not refund, and school pooling uses existing entitlement resolution.
- `CONCURRENCY_DECISION`: Mutations and finalization pessimistically lock the Test row; finalization then locks the usage counter. Finalize/add/reorder races serialize, and totals remain consistent. Position rewrites use a collision-free positive temporary range.
- `DEFERRED`: PDF engines, generated files/storage, email/printing, and student delivery/grading.

## Test PDF exports

- `DOMAIN_DECISION`: Official exports require a FINALIZED Test and build exclusively from immutable TestQuestion snapshots. `TestRenderModel` has separate QUESTION_PAPER and ANSWER_KEY projections, so answer secrecy is enforced before renderer invocation.
- `ENGINEERING_DECISION`: The renderer port is library-neutral; the MVP adapter uses the existing audited `pdf-lib` dependency. It is pure Node, needs no Chromium, performs no network fetching, produces bounded deterministic A4 pages, and stores `test-pdf-v1` as the layout contract.
- `SECURITY_DECISION`: PDFs are private objects under opaque UUID-based keys through the existing ObjectStorageProvider. User titles influence only a sanitized download filename. Authorization precedes metadata reads and object reads; pooled subscription access never grants another teacher access to a private Test or answer key.
- `ACCOUNTING_DECISION`: One new successfully stored QUESTION_PAPER or ANSWER_KEY artifact consumes one PDF_EXPORTS unit. Reservation occurs before rendering and settlement after signature/size validation and storage; failure releases it. Completed cache reuse and downloads consume zero additional units.
- `CONCURRENCY_DECISION`: A PostgreSQL advisory lock serializes cache identity creation, while a durable processing token/lease prevents multiple workers rendering one TestExport. Size, SHA-256, MIME, renderer/snapshot versions, status, audit events, and download counters provide integrity and history.
- `DEFERRED`: Custom embedded fonts/RTL shaping, logos/advanced branding, email/WhatsApp/printing delivery, student access, and cloud storage adapters.
- `VALIDATION`: Deterministic test generation passed real PostgreSQL publication → retrieval → mixed generation → pending Question/options/citations, authorization, regeneration, cancellation-history, and insufficient-knowledge flows. No live AI call was made because an exact AI_MODEL and key are not configured.

# Provider-neutral billing (2026-08-31)

- No production payment provider is named by the SRS or repository, so no vendor SDK is installed and `PAYMENT_PROVIDER_DECISION_REQUIRED=true`.
- Commercial provider state is synchronized into local subscriptions only after signature verification. Checkout/redirect state cannot activate access.
- Individual and pooled-school provider customers use one polymorphic `(owner_type, owner_id)` billing-customer record; school checkout is restricted to a school administrator's own school.
- Manual subscriptions remain valid with nullable provider identifiers and explicit `MANUAL` origin. Provider-managed records use `PROVIDER` origin.
- Payment failure maps to `PAST_DUE`; cancellation-at-period-end preserves active state until a later provider cancellation/expiration event. Upgrades, downgrades, and renewals preserve usage history because usage remains period-scoped and is never reset by billing.
- Safe normalized webhook metadata is retained for retry/audit; exact raw payloads and PCI/card data are not stored. Transaction amounts are integer minor units.
- Reconciliation reports unavailable until a real provider capable of authoritative subscription reads is selected. The deterministic provider is local/test-only.
