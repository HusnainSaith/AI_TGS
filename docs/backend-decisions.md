# Backend decisions

| Status               | Decision / assumption                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONFIRMED_FROM_SRS   | NestJS REST modular monolith, `/api/v1`, PostgreSQL + pgvector, Redis/BullMQ, UUIDs, `timestamptz`, migrations, provider abstractions.                                                        |
| ENGINEERING_DECISION | TypeORM is the single ORM because the request prefers it and no repository convention exists. Schema synchronization is disabled.                                                             |
| ENGINEERING_DECISION | `auth_tokens` persists only SHA-256 token digests and supports refresh rotation/reuse revocation, verification/reset expiry, logout, and logout-all.                                          |
| ENGINEERING_DECISION | Argon2id hashes passwords. Authentication reloads user status instead of trusting token claims for authorization.                                                                             |
| ENGINEERING_DECISION | Curriculum is global in Phase 1, matching the SRS schema. Tenant-owned private domains will require `school_id` and scoped repositories, with RLS as defence in depth.                        |
| ENGINEERING_DECISION | Queue connections are registered only outside test mode; provider secrets remain optional until their adapter is invoked.                                                                     |
| CONFIRMED_FROM_USER  | Global curriculum mutations are SYSTEM_ADMIN-only. SCHOOL_ADMIN and TEACHER are verified-email read-only roles. School-owned curriculum is deferred pending a coherent ownership/scope model. |
| NEEDS_CONFIRMATION   | Whether school-less teachers may access global curriculum and KB only, and how a teacher joins/creates a school.                                                                              |
| CONFIRMED_FROM_USER  | Login may issue tokens to unverified users, but reusable `RequireVerifiedEmail` policy protects curriculum and future normal business endpoints. Verification endpoints remain reachable.     |
| DEFERRED             | Registration does not create a Free subscription until subscription/entitlement implementation.                                                                                               |
| ENGINEERING_DECISION | Curriculum DELETE endpoints archive using a dedicated ACTIVE/ARCHIVED status. No curriculum hard-delete API exists; foreign keys use RESTRICT to prevent destructive tree cascades.           |
| ENGINEERING_DECISION | Curriculum logical names are trimmed and protected by case-insensitive expression indexes within their hierarchy. Archived names remain reserved for stable historical references.            |
| ENGINEERING_DECISION | Core relational migrations and optional RAG migrations are separate. Missing pgvector cannot block identity/curriculum development and produces an actionable error.                          |
| NEEDS_CONFIRMATION   | Preferred payment, email, object-storage, generation-AI, and OCR providers.                                                                                                                   |
| CONFIRMED_FROM_USER  | The MVP embedding provider/model is OpenAI `text-embedding-3-small`; the verified default output is 1,536 dimensions.                                                                         |
| FUTURE_SCOPE         | Student workflows, multiple test versions, imports, marketplace, advanced analytics/retrieval experiments, multimodal OCR, collaboration, and offline generation.                             |

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

## Curriculum mapping and review decisions

- `ENGINEERING_DECISION`: `document_topic_mappings` stores whole-version, contiguous partial Board-to-Topic paths. Range mapping is deferred; curriculum IDs are not copied onto derived chunks.
- `ENGINEERING_DECISION`: Specificity is derived deterministically (Board 1 through Topic 5), with reusable containment and most-specific selection logic.
- `ENGINEERING_DECISION`: A PostgreSQL expression unique index normalizes nullable path IDs with the nil UUID and excludes ARCHIVED rows, preventing concurrent duplicates without depending on `NULLS NOT DISTINCT` support.
- `SECURITY_DECISION`: GLOBAL mappings are mutable only by SYSTEM_ADMIN. SCHOOL mappings are mutable by SYSTEM_ADMIN moderation or same-school SCHOOL_ADMIN; mapping, preview, and coverage queries scope through Version -> Document in SQL.
- `ENGINEERING_DECISION`: Mapping states are DRAFT, PENDING_REVIEW, APPROVED, REJECTED, and ARCHIVED. Approval records server-derived actor/time; rejection and archival preserve history.
- `ENGINEERING_DECISION`: Review readiness requires completed extraction/completeness, chunks, confirmed rights, and an approved active-curriculum mapping. Publication additionally requires CLEAN malware/OCR gates and real model-versioned embeddings. Embeddings do not exist, so publication remains blocked.
- `ENGINEERING_DECISION`: Coverage counts approved mapped processed source metadata with SQL tenant isolation. It is not semantic coverage, RAG readiness, or retrieval quality.

## Malware scanning decisions

- `SECURITY_DECISION`: `none` never returns CLEAN. `windows_defender` is the only concrete adapter and requires an explicit executable path. No operating-system software is installed automatically.
- `SECURITY_DECISION`: Quarantined bytes are obtained through `ObjectStorageProvider`, written under a randomized OS temporary directory, scanned using an argument array with remediation disabled, and deleted in `finally`. Paths and raw scanner logs are not exposed.
- `ENGINEERING_DECISION`: Document versions persist scanner provider, scan time, bounded metadata, and stable error code. State transitions are NOT_SCANNED/FAILED -> SCANNING -> CLEAN|INFECTED|FAILED. CLEAN is idempotent; INFECTED cannot automatically retry.
- `SECURITY_DECISION`: Production extraction requires CLEAN. The unscanned override defaults false, is rejected in production, is explicit in development/test, is recorded in job metrics, and never bypasses publication preflight.
- `ENGINEERING_DECISION`: Approved mappings remain historical when infection is discovered. Publication is blocked distinctly by NOT_SCANNED, FAILED, or INFECTED, and remains blocked by EMBEDDINGS_MISSING even after CLEAN.
- `VALIDATION`: Windows Defender was locally available and returned CLEAN for a harmless `package.json`. Core migrations and all database E2E suites passed against local PostgreSQL.

## Embedding foundation decisions

- `CONFIRMED_FROM_OFFICIAL_DOCS`: `text-embedding-3-small` defaults to 1,536 dimensions, supports the `dimensions` request parameter, accepts array inputs, returns prompt/total token usage, and recommends cosine similarity. The MVP uses the unmodified default and cosine.
- `ENGINEERING_DECISION`: pgvector 0.8.6 and all embedding tables live only in the independent RAG migration chain. `content_chunk_embeddings` is separate from `content_chunks`, so inactive generations remain available for evaluation/rollback.
- `ENGINEERING_DECISION`: The deterministic configuration version hashes provider, model, dimension, metric, and preprocessing version. A future incompatible dimension uses a new forward RAG migration/table or dimension-specific column generation; it is never inserted into `vector(1536)`.
- `ENGINEERING_DECISION`: No HNSW/IVFFlat index is created during storage foundation. Exact technical operators are tested; index selection and tuning belong to measured retrieval work.
- `ENGINEERING_DECISION`: PostgreSQL jobs use atomic claims, UUID tokens, expiring leases, bounded retry, and short persistence transactions. External API calls occur outside transactions. Valid chunk/config/hash rows are idempotently skipped.
- `SECURITY_DECISION`: CLEAN scanning, completed extraction, non-archived content, and non-empty chunks are mandatory. Mapping is an independent branch; publication requires both branches but is not automatically activated.
- `SECURITY_DECISION`: The OpenAI key stays in environment configuration. Status, Swagger, health, errors, audit events, and job metadata exclude keys, raw vectors, authorization headers, and full source chunks. The deterministic adapter cannot start in production.
- `DEFERRED`: ANN indexing, hybrid retrieval, FTS ranking, reranking, RetrievalEvent, QuestionCitation, RAG prompting, and AI question generation.
