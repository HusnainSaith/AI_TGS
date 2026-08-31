Software Requirements Specification
AI-Powered Automatic Test Generation System
Version 2.2 | 29 August 2026
Attribute Value
Document Type Software Requirements Specification (SRS)
Platform Android (MVP) → iOS / Web Admin Panel (later phases)
Frontend Flutter + Riverpod
Backend NestJS + REST API
Database PostgreSQL + pgvector (+ Redis for caching/queues)
Architecture Feature-First Clean Architecture (client) / Modular Monolith (server) with asynchronous AI and ingestion workers
Authentication JWT + Refresh Tokens, RBAC
AI Layer Provider-agnostic, RAG-grounded AI Generation Service with citation traceability
Monetization Freemium + Subscription (Teacher Pro / School)
Document Status Master SRS v2.2 — RAG/Knowledge Base integrated; approved for MVP planning and implementation

1. Introduction
   1.1 Purpose
   This document specifies the functional and non-functional requirements for the AI-Powered Automatic Test Generation System (referred to as “TGS” or “the System”). The System allows subscribed teachers to generate a complete, exam-ready test paper through Class → Section → Subject → Chapter → Topic → Question-Type Quantities. A Retrieval-Augmented Generation (RAG) service retrieves approved curriculum content from the Knowledge Base, grounds the AI request in that evidence, and produces questions that the teacher can review, edit, trace to sources, and export as a professional PDF.
   1.2 Product Vision
   To become the fastest way for a teacher to go from approved curriculum content to a print-ready, curriculum-aligned test paper — using source-grounded AI to remove manual question-writing effort while keeping a human teacher in control of governance, accuracy, and final approval.
   1.3 Core Differentiator vs. v1.0 SRS
   The original SRS (v1.0) treated AI generation as future scope; v2.0 made it the primary subscription-gated workflow. This v2.2 revision retains that workflow and adds a dedicated RAG/Knowledge Base module so generation is grounded in approved textbook, syllabus, notes, and curriculum documents instead of relying mainly on topic descriptions or model memory. Manual question banking remains a secondary capability.
   1.4 Definitions & Abbreviations
   Term Definition
   TGS Test Generation System (this product)
   Topic The most granular curriculum node, nested under Chapter (e.g. “Newton's First Law” under Chapter “Force and Motion”)
   Generation Request A single user-submitted spec of class/section/subject/chapter/topic + question-type quantities sent to the AI layer
   Generation Job The asynchronous backend unit of work that fulfils one Generation Request
   Entitlement A subscription-plan-derived permission/limit (e.g. AI questions per month)
   MCQ Multiple Choice Question (single correct answer, 4 options)
   RBAC Role-Based Access Control
   RAG Retrieval-Augmented Generation: retrieval of approved source chunks before the LLM generates questions.
   Knowledge Base (KB) Governed collection of uploaded, versioned, curriculum-mapped source documents and searchable chunks.
   Knowledge Document A textbook, syllabus, teacher note, policy, or other approved source file ingested into the KB.
   Content Chunk A bounded source segment stored with metadata and a vector embedding for retrieval.
   Retrieval Event Auditable record of query, filters, selected chunks, scores, and retrieval configuration for one generation unit.
   Citation / Provenance Link from a generated question to the document version, page/section, and evidence chunk.
2. Goals
   ⦁ Let a teacher produce a complete test paper in under 3 minutes from curriculum selection to PDF.
   ⦁ Generate curriculum-accurate questions using AI, scoped precisely to Class → Section → Subject → Chapter → Topic.
   ⦁ Support a mixed basket of question types and exact counts per type in one request (e.g. 10 Short, 3 Long, 15 MCQ).
   ⦁ Guarantee no duplicate questions within a generated test, and minimise repetition across a teacher's test history.
   ⦁ Keep a human teacher in the loop: every AI-generated question is editable and must be reviewable before being trusted as question-bank content.
   ⦁ Enforce subscription entitlements (question/test/AI quotas) strictly on the backend.
   ⦁ Produce professional, branded, print-ready PDFs (test + answer key).
   ⦁ Persist all generated tests and questions for reuse, editing, duplication, and analytics.
   ⦁ Design the AI layer as a swappable, provider-agnostic service so the underlying LLM vendor can change without affecting the rest of the system.
   ⦁ Build a foundation that scales from a single teacher to schools with many teachers sharing curriculum and question banks.
   ⦁ Ground generation in published, curriculum-mapped Knowledge Base content using hybrid semantic and keyword retrieval.
   ⦁ Preserve question-level provenance so teachers and administrators can inspect the source document, page/section, and retrieved excerpt.
   ⦁ Provide a governed ingestion, review, publication, versioning, re-indexing, and retirement lifecycle for educational content.
3. Target Users
   3.1 Teacher (Primary)
   Selects curriculum criteria, requests AI-generated tests, reviews/edits questions, manages a personal question bank, generates PDFs, and manages their subscription.
   3.2 School Administrator
   Manages teacher accounts under a School subscription, shared curriculum/question bank, branding, usage analytics, and school-scoped Knowledge Base documents; approves curriculum mappings and publication where delegated.
   3.3 System Administrator
   Manages boards, curriculum hierarchy, global question moderation, Knowledge Base ingestion/publication, curriculum mappings, embedding/retrieval configuration, AI providers and prompt templates, plans, and platform analytics.
   3.4 Student (Future)
   Takes AI-generated tests online, receives automatic marking (for objective types), and views results/performance analytics.
4. Scope
   4.1 MVP Scope
   ⦁ Registration, login, logout, email verification, forgot/reset/change password.
   ⦁ Curriculum management: Boards, Classes, Sections, Subjects, Chapters, Topics.
   ⦁ Guided test-request flow: Class → Section → Subject → Chapter → Topic(s) → question-type quantities.
   ⦁ RAG-grounded AI question generation against the selected scope, honouring per-type quantities and difficulty mix and using only eligible published Knowledge Base content.
   ⦁ Duplicate detection against the teacher's existing question bank and within the same generation batch.
   ⦁ Manual question CRUD, search, and filtering (supporting/secondary flow).
   ⦁ Question and generated-test review/edit screen before finalising.
   ⦁ Test assembly: sections, ordering, marks, duration, instructions, preview.
   ⦁ Test PDF and answer-key PDF generation with school branding.
   ⦁ Download, share, print, save, edit, delete, duplicate, and regenerate tests.
   ⦁ Subscription plans (Free / Teacher Pro / School) with backend-enforced entitlements and in-app purchase / payment gateway integration.
   ⦁ Test history with full audit of what was AI-generated vs. manually authored/edited.
   ⦁ Knowledge Base upload, malware scanning, text/OCR extraction, chunking, embedding, curriculum mapping, review, publication, versioning, and archival.
   ⦁ RAG retrieval over published content using curriculum and tenant filters, with question-level citations and teacher-visible evidence.
   ⦁ Administrator content-readiness/ingestion screens and teacher grounding-status/citation views.
   4.2 Phase 2 Scope
   ⦁ Multiple test versions (A/B/C/D) with shuffled question order/options.
   ⦁ Excel / CSV / Word question import with validation and preview.
   ⦁ Board-specific curriculum templates and shared/public question banks.
   ⦁ AI explanations, difficulty re-classification, and question rewriting/improvement.
   ⦁ Advanced analytics: topic coverage, difficulty distribution, question reuse rate.
   ⦁ Advanced retrieval analytics, chunk-quality feedback, reranking experiments, and automated grounding/evidence quality scoring.
   ⦁ Optional multimodal ingestion for diagrams, equations, and scanned pages requiring specialised OCR/vision models.
   4.3 Future Scope
   ⦁ Online test delivery, student portal, automatic marking, and performance analytics.
   ⦁ Multi-school tenancy, curriculum/question marketplace.
   ⦁ Offline caching of curriculum and recent tests.
   ⦁ Notifications, in-app messaging, and collaboration between teachers.
5. Core User Flow — Guided AI Test Generation
   This is the primary MVP workflow and the reason the System exists. Every step below is a required, validated step in the request wizard; the backend re-validates all selections regardless of what the client sends.
   Step User Action System Behaviour
   Select Class Loads Sections and confirms the teacher/school has access to this Class.
   2 Select Section Optional if the school doesn't use sections; defaults to “All”.
   3 Select Subject Filtered to subjects mapped to the chosen Class (and Board, if applicable).
   4 Select Chapter(s) One or more chapters may be selected; each can carry its own topic/quantity mix.
   5 Select Topic(s) Topics nested under the chosen chapter(s); teacher may select “All topics in chapter” or specific topics.
   6 Specify question mix Teacher enters counts per question type and optional per-type difficulty split, e.g. MCQ: 15, Short: 10, Long: 3, True/False: 0, Fill-in-Blank: 0.
   7 Set constraints (optional) Total marks/duration target, difficulty ratio (Easy/Medium/Hard %), language, and “avoid questions used in the last N tests.”
   8 Submit Generation Request Backend validates entitlement, scope, quantities, and Knowledge Base readiness; creates an asynchronous Generation Job and returns a job ID.
   9 RAG Retrieval & AI Generation Resolve published curriculum-mapped sources, perform filtered hybrid retrieval, record a Retrieval Event, build a grounded prompt, call the AI provider, validate output/citations, and check duplicates.
   10 Review & Edit Teacher reviews questions with grounding status and source citations; can open evidence, regenerate, edit, reorder, remove, or manually add a question.
   11 Assemble Test Questions are organised into sections with titles, instructions, and marks; teacher previews the full paper.
   12 Finalise & Export Test is saved (DRAFT → GENERATED → FINAL) and PDF + answer key are generated and made available for download/share/print.
   5.1 Sample Generation Request (illustrative)
   “Generate a Physics test for Class 9 – Section A, Chapter: Force and Motion, Topics: Newton's Laws, Friction — 15 MCQ, 10 Short, 3 Long, difficulty split 40% Easy / 40% Medium / 20% Hard, total duration 90 minutes.” The System resolves this into a structured JSON request (see § 15.4) that the AI Generation Service consumes.
6. Functional Requirements
   ID Requirement Description
   FR-01 Authentication Registration, login, logout, email verification, forgot/reset password, secure JWT + refresh-token management.
   FR-02 Login Email/password login returning access token, refresh token, and user profile including role and active subscription.
   FR-03 Email Verification Verification flow required before unrestricted account access.
   FR-04 Forgot Password Email-based password reset workflow with expiring token.
   FR-05 User Profile View/edit profile, phone, profile image, password, and logout from all devices.
   FR-06 Board Management Create, view, edit, delete examination boards/curricula (admin).
   FR-07 Class Management Create, view, edit, delete classes; link to boards.
   FR-08 Section Management Create, view, edit, delete sections within a class (e.g. A, B, C).
   FR-09 Subject Management Create, view, edit, delete subjects linked to class/board.
   FR-10 Chapter Management Create, view, edit, delete chapters linked to subjects, with ordering.
   FR-11 Topic Management Create, view, edit, delete topics nested under chapters; topics are the smallest AI-scoping unit.
   FR-12 Question Management Create, edit, delete, search, filter, and manage questions (manual authoring path).
   FR-13 Question Types MCQ, Short Answer, Long Answer, True/False, Fill-in-the-Blank for MVP.
   FR-14 MCQ Structure Four-option MCQ with exactly one correct answer, explanation, marks, and difficulty.
   FR-15 Difficulty Levels Easy, Medium, Hard, selectable per question and settable as a ratio per generation request.
   FR-16 Question Search Full-text search by question text, topic, and academic metadata.
   FR-17 Question Filtering Filter by class, section, subject, chapter, topic, type, difficulty, marks, and source (AI-generated vs. manual).
   FR-18 Pagination Paginated question and test retrieval through REST APIs.
   FR-19 Guided Generation Wizard Step-by-step selection of Class → Section → Subject → Chapter → Topic → per-type quantities, per § 5.
   FR-20 AI Test Generation Submits a Generation Request and asynchronously produces questions matching the requested scope, types, counts, and difficulty ratio.
   FR-21 Generation Job Status Teacher can poll/subscribe to job status (QUEUED, PROCESSING, PARTIAL, COMPLETED, FAILED) and view partial results as they stream in.
   FR-22 Per-Question Regeneration Teacher can regenerate a single question in place without discarding the rest of the set.
   FR-23 Duplicate Prevention System prevents duplicate/near-duplicate questions within one generation batch and against the teacher's existing bank, using text-similarity/embedding comparison.
   FR-24 AI Output Validation Generated output is schema-validated (structure, option count, correct-answer presence, marks, language) before being shown to the teacher; malformed items are auto-retried.
   FR-25 Manual Test Creation Teacher can create a test and manually select existing bank questions instead of, or alongside, AI generation.
   FR-26 Mixed Assembly A single test can combine AI-generated and manually authored/edited questions.
   FR-27 Test Sections Organise questions into sections with titles, instructions, marks, and ordering.
   FR-28 Question Reordering Drag-and-drop question ordering within and across sections.
   FR-29 Test Preview Preview the complete paper (and answer key) before PDF generation.
   FR-30 Test Editing Add/remove/replace/reorder questions; edit marks, instructions, title, and duration at any time before finalising.
   FR-31 Save Test Persist tests with status DRAFT, GENERATED, FINAL, or ARCHIVED.
   FR-32 Test History View previous tests with view/edit/duplicate/regenerate/PDF/answer-key/delete actions.
   FR-33 Duplicate Test Create a new test (and optionally a new generation request) from an existing test's configuration.
   FR-34 Multiple Versions (Phase 2) A/B/C/D versions with controlled question and option shuffling.
   FR-35 PDF Generation Professional test PDF with school branding and examination metadata.
   FR-36 Answer Key Generate answer keys and, where applicable, model answers/marking rubrics/points.
   FR-37 PDF Sharing Download, open, share, and print generated PDFs.
   FR-38 School Branding School name, logo, address, phone, email, website, and footer on generated PDFs.
   FR-39 Question Import (Phase 2) Excel, CSV, Word, and JSON import with validation and preview.
   FR-40 AI Human Review Gate AI-generated content is clearly flagged “Unreviewed” until a teacher approves it; only approved content is reusable as trusted question-bank content for future manual reuse or sharing.
   FR-41 Subscription & Entitlements Every AI generation, question save, and PDF export is checked against the active plan's quota before execution; usage is decremented/logged transactionally.
   FR-42 Billing & Payments Plan purchase, upgrade/downgrade, renewal, payment method management via an integrated payment gateway; webhook-driven status sync.
   FR-43 Usage Dashboard Teacher/School Admin can view current-cycle usage against plan limits (AI questions used, tests created, storage used).
   FR-44 Curriculum Sharing (School plan) School Admin can publish shared chapters/topics/question banks visible to all teachers in the school.
   FR-45 Audit Logging Security-relevant and quota-relevant actions (auth, generation requests, plan changes, deletions) are logged with actor, timestamp, and outcome.
   FR-46 Knowledge Document Management System/School Admin can upload, list, inspect, version, archive, and delete permitted KB documents with curriculum, language, source, ownership, and rights metadata.
   FR-47 Secure Ingestion Job Each upload creates an async job for malware/signature validation, extraction/OCR, normalisation, chunking, embedding, verification, and publication readiness.
   FR-48 Text Extraction & OCR Extract text, headings, page numbers, supported tables, and OCR text while retaining page/section provenance and confidence.
   FR-49 Chunking & Embeddings Use configurable structure-aware chunking with overlap and provider/model/version-tagged embeddings in PostgreSQL + pgvector.
   FR-50 Curriculum Mapping Map documents or ranges to Board → Class → Subject → Chapter → Topic, with validation and approval.
   FR-51 KB Publication Lifecycle Use DRAFT, PROCESSING, READY_FOR_REVIEW, PUBLISHED, FAILED, ARCHIVED states; only PUBLISHED versions are retrievable.
   FR-52 Hybrid Retrieval Use tenant/curriculum-filtered vector similarity plus PostgreSQL full-text search, optional reranking, topK, thresholds, and context budget.
   FR-53 Retrieval Isolation Apply tenant, role, curriculum, language, publication, and version filters before scoring; prevent cross-school retrieval.
   FR-54 Grounded Prompting Separate instructions from labelled evidence, require evidence-only generation, and define an insufficient-evidence response.
   FR-55 Question Citations Store citations to exact document version/chunk with page/section locator, excerpt hash, score, and order.
   FR-56 RAG Failure Handling REQUIRED mode returns insufficient knowledge without consuming question quota; approved PREFERRED fallback is clearly labelled ungrounded.
   FR-57 KB Administration UI Monitor ingestion, preview extracted content/chunks, manage mappings, publish, re-index, inspect failures, and view curriculum coverage.
   FR-58 Teacher Source Visibility Show grounding status, citation excerpts/locators, source issue reporting, and regenerate-with-same/refreshed-evidence controls.
   FR-59 Versioning & Re-indexing New versions create new chunks/embeddings without mutating historical evidence; old versions remain auditable.
   FR-60 RAG Audit Logging Audit upload, scan, extraction, mapping, publication, re-index, retrieval, fallback, citation, and document access.
7. AI Test Generation — Detailed Requirements
   7.1 Generation Algorithm
8. Resolve and validate the requested scope (class/section/subject/chapter/topic IDs belong to the teacher's board and are active).
9. Validate the requested question-type quantities against plan entitlement (remaining monthly AI-question quota) and reasonable per-request ceilings (configurable; default max 100 questions per request).
10. Split the request into generation units: one unit per (topic × question type), carrying count, difficulty sub-mix, language, grounding mode, and context budget.
11. For each unit, resolve eligible PUBLISHED document versions, run filtered hybrid retrieval, optionally rerank, enforce relevance/token budget, record a Retrieval Event, and build a prompt containing clearly delimited source chunks before calling the AI provider for strict JSON.
12. Validate each returned item against the type schema, verify cited source labels exist in the Retrieval Event, and reject unsupported claims or missing evidence.
13. Run duplicate/near-duplicate detection: exact text match, then embedding-similarity comparison (configurable threshold) against (a) the same batch, (b) the teacher's question bank, and (c) recently used questions for that topic (if “avoid repeats” is enabled).
14. Auto-retry failed or duplicate items (bounded retry count) with a regeneration prompt that explicitly excludes the rejected items.
15. Aggregate accepted items, tag source = AI_GENERATED, review_status = PENDING, grounding_status = GROUNDED (or permitted UNGROUNDED), and persist prompt/model/retrieval metadata and citations.
16. Persist generated questions and update the Generation Job status; notify the client (WebSocket/polling) that results are ready or partially ready.
17. Deduct the consumed quota from the teacher's/school's subscription usage counter transactionally alongside job completion.
    7.2 Asynchronous Processing
    Generation Requests above a small item threshold are processed as background jobs via a queue (e.g. Redis/BullMQ) so the API responds immediately with a job ID; the UI does not block. Small requests may be fulfilled synchronously with a strict timeout, falling back to async on timeout.
    7.3 Prompt Strategy
    ⦁ Prompt templates are versioned and stored server-side (never in the client), keyed by question type, so behaviour can be tuned without an app release.
    ⦁ Each prompt is grounded with curriculum metadata, target difficulty/marks/language, retrieved source chunks with stable labels and locators, evidence-use policy, and output-schema/citation instructions.
    ⦁ The prompt separates system instructions from untrusted document content, requires use of supplied evidence only, ignores instructions inside sources, cites source labels, declares insufficient evidence, and avoids supplied duplicates.
    ⦁ Output is strict JSON including sourceChunkIds; the parser rejects and retries schema, citation, grounding, or evidence-coverage violations instead of repairing free text.
    7.4 Sample Generation Request Payload
    POST /ai/tests/generate
    {
    "classId": "c9",
    "sectionId": "sec-a",
    "subjectId": "physics",
    "chapters": [
    {
    "chapterId": "ch-force-motion",
    "topicIds": ["t-newtons-laws", "t-friction"]
    }
    ],
    "questionMix": [
    { "type": "MCQ", "count": 15, "difficulty": { "easy": 6, "medium": 6, "hard": 3 } },
    { "type": "SHORT", "count": 10, "difficulty": { "easy": 4, "medium": 4, "hard": 2 } },
    { "type": "LONG", "count": 3, "difficulty": { "easy": 0, "medium": 2, "hard": 1 } }
    ],
    "language": "en",
    "knowledgeBase": {
    "mode": "REQUIRED",
    "documentIds": [],
    "topK": 12,
    "minSimilarity": 0.72,
    "includeCitations": true
    },
    "avoidRepeatsFromLastNTests": 3,
    "targetDurationMinutes": 90
    }
    7.5 Sample Generation Job Response
    {
    "success": true,
    "message": "Generation job created",
    "data": {
    "jobId": "job_8f21ac",
    "status": "QUEUED",
    "requestedCount": 28,
    "estimatedSeconds": 25
    "groundingMode": "RAG_REQUIRED",
    "retrievalStatus": "PENDING"
    }
    }
    7.6 AI Provider Abstraction
    The AI Generation Service sits behind an internal interface (generateQuestions(unit): QuestionCandidate[]) with a swappable provider adapter (e.g. Anthropic, OpenAI, or a self-hosted model). Provider selection, model name, temperature, and max-token settings are environment-configured, never hard-coded, so the provider can change without touching business logic.
    7.7 Cost & Rate Control
    ⦁ Per-plan monthly AI-question quotas enforced before job creation; hard-stop on exhaustion with a clear upgrade prompt.
    ⦁ Per-teacher and per-IP rate limiting on generation-request creation to prevent abuse.
    ⦁ Token, embedding, retrieval/reranking, OCR, storage, and cost usage per job/document is logged for monitoring and pricing analysis.
    ⦁ Configurable per-request maximum item count to bound worst-case cost of a single call.
    7.8 Human Review Gate
    AI-generated questions are marked review_status = PENDING and visually flagged. Review displays grounding status and source citations. A question becomes trusted/shareable only after teacher approval; editing marks it teacher-reviewed but preserves original provenance.
    7.9 Dedicated RAG / Knowledge Base Module
    The Knowledge Base is a governed backend module, not a general file store. It owns source ingestion, curriculum mapping, publication state, chunks, embeddings, retrieval, and provenance. The Question Bank remains the system of record for generated/manual questions.
    7.9.1 Content Sources and Ownership
    MVP sources are text PDF, DOCX, TXT, administrator notes, and scanned PDF when OCR is enabled. Every document records GLOBAL/SCHOOL scope, uploader, source type, language, rights/permission metadata, checksum, size, storage key, and active version. Malformed, executable, unsupported, or unsafe files never enter retrieval.
    7.9.2 Ingestion Pipeline
    Upload → quarantine/object storage → malware/signature scan → extract/OCR → normalise → preserve locators → structure-aware chunking/overlap → embeddings → completeness verification → curriculum mapping → administrator review → atomic publication. Steps are idempotent and retryable.
    7.9.3 Curriculum Mapping and Publication
    A document version may map to multiple curriculum nodes; more-specific mappings take precedence. Administrators preview extracted text and sampled chunks. Publishing creates an immutable retrieval snapshot; archiving blocks new retrieval while preserving historical citations.
    7.9.4 Retrieval Algorithm
    Build the query from curriculum path, topic description, question type, learning objective/difficulty, language, and constraints. Apply access/publication filters before combining pgvector similarity with full-text rank; optionally rerank, remove redundant chunks, and pack evidence within a context-token budget.
    7.9.5 Grounding and Citation Contract
    Supply each chunk with stable label, document/version ID, page/section locator, and content hash. The LLM must cite supplied labels. Validation rejects unknown citations, verifies retrieved membership, stores question_citations, and exposes evidence during teacher review.
    7.9.6 Insufficient Evidence and Fallback
    Default MVP policy is REQUIRED. If no published content passes threshold, the unit returns INSUFFICIENT_KNOWLEDGE with coverage guidance and no accepted questions/quota charge. Administrator-enabled PREFERRED fallback is labelled UNGROUNDED and still requires approval.
    7.9.7 Content Safety and Prompt-Injection Defence
    Treat uploaded content as untrusted data. Strip active content and suspicious markup; use fixed delimiters and instruction precedence; source text cannot request tools or secrets. Apply retention/redaction rules to logs and extracted text.
    7.9.8 Operational Controls
    Version embedding model, chunk size/overlap, topK, threshold, hybrid weights, reranker, and context budget. Re-index beside the active index and switch only after evaluation/completeness checks, with rollback.
18. Subscription & Monetization Requirements
    Plan AI Questions / Month Manual Questions Tests PDF Branding Other
    Free 20 Unlimited 5 / month Basic (watermarked) Single teacher, no sharing
    Teacher Pro 500 (or unlimited, tier-dependent) Unlimited Unlimited Advanced, no watermark Multiple versions (Phase 2), imports (Phase 2)
    School Pooled per-seat quota Unlimited Unlimited School branding Multiple teacher seats, shared bank, admin analytics
    ⦁ All limits above are enforced server-side; the Flutter client reflects but never enforces limits.
    ⦁ Every quota-consuming action (AI generation job creation, PDF export beyond free tier, etc.) is wrapped in a database transaction that checks-then-decrements the relevant counter to prevent race conditions/over-use.
    ⦁ Plan purchase, upgrade, downgrade, and cancellation are handled via an integrated payment gateway (e.g. Stripe / a regional provider); the gateway's webhooks are the source of truth for subscription state.
    ⦁ Usage counters reset on the subscription's billing-cycle boundary, tracked per teacher (Free/Pro) or per school (School plan, pooled across seats).
    ⦁ Failed/expired payments downgrade the account to Free at cycle end, not immediately, with in-app warnings beforehand.
19. Database Requirements
    9.1 Core Tables
    Table Key Columns
    boards id, name, description, created_at, updated_at
    users id, name, email, phone, password_hash, role, profile_image, email_verified, status, school_id, created_at, updated_at
    schools id, name, logo_url, address, phone, email, website, created_at, updated_at
    classes id, name, board_id, created_by, created_at, updated_at
    sections id, class_id, name, created_at, updated_at
    subjects id, name, class_id, board_id, language, description, created_at, updated_at
    chapters id, subject_id, chapter_number, name, description, created_at, updated_at
    topics id, chapter_id, name, description, order, created_at, updated_at
    questions id, topic_id, chapter_id, subject_id, class_id, type, question_text, difficulty, marks, explanation, source (AI_GENERATED / MANUAL), review_status (PENDING / APPROVED), generation_job_id, created_by, status, created_at, updated_at
    question_options id, question_id, option_text, option_order, is_correct
    tests id, title, class_id, section_id, subject_id, created_by, duration, total_marks, instructions, status, created_at, updated_at
    test_questions id, test_id, question_id, section, question_number, marks, sort_order
    9.2 Knowledge Base & RAG Tables
    Table Key Columns
    knowledge_documents id, tenant_scope, school_id, title, source_type, language, rights_metadata, status, active_version_id, created_by
    document_versions id, document_id, version_no, storage_key, checksum, mime_type, page_count, extraction_status, published_at, archived_at
    ingestion_jobs id, document_version_id, status, current_step, error_code, metrics, started_at, completed_at
    content_chunks id, document_version_id, chunk_index, content, page locators, section_path, token_count, content_hash, embedding vector(n), embedding_model
    document_topic_mappings id, document_version_id, board/class/subject/chapter/topic ids, status, mapped_by, approved_by
    retrieval_events id, generation_job/item ids, query_text, filters, strategy_version, top_k, threshold, selected_chunks, status, latency_ms
    question_citations id, question_id, retrieval_event_id, content_chunk_id, document_version_id, locator, excerpt_hash, score, order
    9.3 AI & Subscription Tables
    Table Key Columns
    generation_jobs id, requested_by, request_payload (jsonb), status (QUEUED/PROCESSING/PARTIAL/COMPLETED/FAILED), requested_count, generated_count, model, provider, token_usage, cost, created_at, completed_at
    generation_job_items id, generation_job_id, question_id, unit_topic_id, unit_type, retry_count, rejection_reason
    plans id, name, price, billing_interval, ai_question_limit, test_limit, features (jsonb)
    subscriptions id, user_id / school_id, plan_id, status, current_period_start, current_period_end, payment_provider_ref, created_at, updated_at
    usage_counters id, subscription_id, cycle_start, ai_questions_used, tests_created, pdf_exports
    payments id, subscription_id, amount, currency, status, provider, provider_ref, created_at
    audit_logs id, actor_id, action, entity_type, entity_id, metadata (jsonb), created_at
    9.4 Database Relationships
    ⦁ Board → Class → Section; Class → Subject → Chapter → Topic → Questions.
    ⦁ Generation Job → Generation Job Items → Questions (traces every AI-generated question back to its originating request/prompt).
    ⦁ Test → Test Questions → Questions (a question can appear in many tests).
    ⦁ User/School → Subscription → Plan; Subscription → Usage Counters (per billing cycle) and Payments.
    ⦁ User → Questions and Tests (authorship/ownership); School → Users (seat membership).
    ⦁ Knowledge Document → Document Versions → Content Chunks; published versions are immutable for retrieval/audit.
    ⦁ Document Version ↔ Curriculum nodes through Document Topic Mappings, which define eligibility.
    ⦁ Generation Job Item → Retrieval Event → selected Content Chunks; Question → Question Citations → exact source version/chunk.
    ⦁ GLOBAL/SCHOOL scope → Knowledge Documents; tenant isolation is applied before similarity scoring.
20. REST API Requirements
    Base URL: /api/v1
    Domain Endpoints
    Auth POST /auth/register | POST /auth/login | POST /auth/logout | POST /auth/refresh | POST /auth/verify-email | POST /auth/forgot-password | POST /auth/reset-password | GET /auth/me
    Users GET /users/me | PATCH /users/me | PATCH /users/me/password
    Curriculum GET/POST /boards | GET/POST /classes | GET/POST /sections | GET/POST /subjects | GET/POST /chapters | GET/POST /topics (+ GET/PATCH/DELETE /:id for each)
    Questions GET/POST /questions | GET/PATCH/DELETE /questions/:id | POST /questions/:id/approve
    AI Generation POST /ai/tests/generate | GET /ai/jobs/:jobId | GET /ai/jobs/:jobId/items | GET /ai/jobs/:jobId/retrieval | POST /ai/jobs/:jobId/items/:itemId/regenerate | DELETE /ai/jobs/:jobId
    Tests GET/POST /tests | GET/PATCH/DELETE /tests/:id | POST /tests/:id/duplicate | POST /tests/:id/pdf | GET /tests/:id/answer-key
    Subscriptions GET /plans | GET /subscriptions/me | POST /subscriptions/checkout | POST /subscriptions/cancel | POST /webhooks/payments
    Usage GET /usage/me
    Knowledge Base GET/POST /kb/documents | GET/PATCH/DELETE /kb/documents/:id | POST /kb/documents/:id/versions | GET /kb/document-versions/:id/preview | POST /kb/document-versions/:id/publish | POST /kb/document-versions/:id/archive
    Ingestion & Mapping GET /kb/ingestion-jobs/:jobId | POST /kb/ingestion-jobs/:jobId/retry | GET/POST /kb/document-versions/:id/mappings | DELETE /kb/mappings/:id | POST /kb/document-versions/:id/reindex
    Retrieval & Citations POST /kb/retrieval/preview | GET /ai/jobs/:jobId/retrieval | GET /questions/:id/citations | GET /kb/coverage?classId=&subjectId=&chapterId=&topicId=
    10.1 Standard API Responses
    Success: { success: true, message: "Operation successful", data: {} }
    Error: { success: false, message: "Validation failed", errors: { field: ["error"] } }
    Quota Exceeded (HTTP 402/403): { success: false, message: "AI question quota exceeded for this billing cycle", errors: { quota: ["ai_question_limit"] } }
21. Non-Functional Requirements
    11.1 Performance
    ⦁ Standard CRUD API requests respond within ~500 ms under normal load.
    ⦁ Generation Request submission (job creation) responds within ~1 second; the AI call itself runs asynchronously.
    ⦁ Small synchronous generations (≤ 5 questions) may target a ~10–15 second end-to-end response with a strict timeout and automatic fallback to async.
    ⦁ Lists use pagination; long-running operations never block the UI thread.
    ⦁ Retrieval preview targets p95 ≤ 1.5 seconds for indexed content; generation submission remains asynchronous.
    ⦁ Ingestion has configurable size/page limits and reports pipeline-step progress; HTTP requests never wait for extraction/embedding.
    ⦁ Performance tests cover filtered vector/full-text retrieval at expected high-cardinality tenant/curriculum scale.
    11.2 Security
    ⦁ HTTPS everywhere, JWT + refresh tokens, password hashing (bcrypt/argon2), RBAC, input validation, rate limiting, CORS.
    ⦁ AI provider API keys stored server-side only (secrets manager), never exposed to the client.
    ⦁ Secure file uploads (images/logos), database constraints, and audit logging for auth and quota-relevant actions.
    ⦁ Prompt-injection mitigation: user-supplied free text (e.g. topic descriptions) is sanitised/escaped before being embedded in AI prompts.
    ⦁ Quarantine uploads; validate signature/MIME, scan malware, limit size/pages, use non-guessable object keys, and never execute active content/macros.
    ⦁ Enforce tenant isolation in SQL/RLS or repository guards before vector scoring, retrieval preview, and citation access.
    ⦁ Treat document text as untrusted prompt data with delimiters, instruction hierarchy, sanitisation, output validation, and no-tool/no-secret policy.
    ⦁ Require copyright/licence/permission metadata before publication and support archive/deletion under audit/provenance policy.
    11.3 Reliability
    ⦁ Graceful API error handling with meaningful user messages.
    ⦁ Generation Jobs are retried with bounded backoff on transient AI-provider failures; permanent failures surface a clear “regenerate” action.
    ⦁ Transactional test generation and quota deduction — partial failures never silently over-charge a teacher's quota.
    ⦁ Validation of curriculum/question availability before assembling a test.
    ⦁ Ingestion/embedding is idempotent and checksum-aware; retries cannot create duplicate active chunks.
    ⦁ Publication is atomic only after extraction, chunking, embedding, mapping, and completeness checks succeed.
    ⦁ Historical citations resolve immutable versions after newer versions are published.
    11.4 Scalability
    ⦁ PostgreSQL for relational data, full-text search, and pgvector; Redis for caching/queues/rate-limits; object storage for sources/PDFs/images; separate ingestion, embedding, AI, and PDF workers.
    ⦁ Stateless NestJS instances behind a load balancer; horizontal scaling of workers independent from API instances.
    ⦁ AI provider calls isolated behind a queue so provider slowness never degrades unrelated API latency.
    ⦁ Embedding and generation providers use independent adapters, quotas, retries, circuit breakers, and observability.
    ⦁ Large KBs use tenant/curriculum partitioning and index tuning; re-indexing builds a new version without interrupting active retrieval.
    11.5 Offline
    MVP is primarily online; future versions may cache curriculum data and recently generated tests for limited offline review (not offline generation, which requires the AI provider).
22. AI Architecture
    Flutter / Web Admin → NestJS API → Curriculum, Knowledge Base, Question Bank, Test, Subscription, and Audit modules. Uploads enter object storage and an Ingestion Queue; workers scan, extract/OCR, chunk, embed, and publish to PostgreSQL + pgvector. Generation Requests enter a queue; the AI Worker calls Retrieval Service for filtered hybrid search, records Retrieval Events, passes labelled evidence to Prompt Builder → AI Provider → LLM → Output/Citation Validator → Duplicate Checker → persist questions + citations → teacher review.
    AI and retrieval are decoupled from the Question/Test domain. They produce the same Question entity shape as manual authoring plus provenance metadata. Downstream search, assembly, and PDF export are consistent, while review/audit exposes grounding and citations.
    12.1 Knowledge Ingestion Path
    Admin upload → quarantine/storage → scan → Ingestion Queue → extraction/OCR → normalisation → chunking → embedding adapter → PostgreSQL + pgvector → mapping review → atomic publication.
    12.2 RAG Generation Path
    Teacher scope → entitlement/KB preflight → Generation Job → filtered hybrid retrieval/rerank → context packing → Retrieval Event → grounded prompt → LLM → schema/citation/evidence validation → duplicate check → persist questions/citations → teacher review.
    12.3 Service Boundaries
    Knowledge Base Service owns documents, versions, mappings, chunks, and publication. Retrieval Service owns query/filter/ranking/context/audit. AI Generation owns prompts/provider/output/retries. Question Service owns accepted questions, approval, and exposed citations.
23. PDF Architecture
    Flutter → POST /tests/:id/pdf → Backend PDF Service → Object Storage → Signed PDF URL → Flutter (download/share/print).
24. Flutter Requirements
    ⦁ Flutter and Dart, Riverpod for state management, Dio for REST API communication.
    ⦁ GoRouter for navigation; Freezed/json_serializable for models.
    ⦁ Flutter Secure Storage for tokens.
    ⦁ Feature-First Clean Architecture: lib/app | lib/core | lib/design_system | lib/features | lib/shared.
    ⦁ Real-time or polling client for Generation Job status (WebSocket preferred; polling fallback).
    ⦁ Responsive, reusable design-system components, including a multi-step wizard component for the generation flow.
    14.1 Screen Requirements
    Group Screens
    Authentication Splash, Onboarding, Login, Register, Email Verification, Forgot Password, Reset Password, Change Password
    Main Dashboard, Notifications, Profile, Settings, Usage & Plan
    Curriculum Classes, Sections, Subjects, Chapters, Topics (+ Create/Edit for each, admin/school scope)
    Generation Wizard Select curriculum, Knowledge Coverage/Source Choice, Question Mix/Difficulty, Constraints, retrieval/job progress, Review & Edit with citations
    Questions Question Bank, Question Details, Add/Edit Question, MCQ Editor, Short/Long Editor, True/False Editor, Fill-Blank Editor, Filters
    Tests Test Builder, Sections & Ordering, Preview, Details, History, Duplicate, Answer Key, PDF Preview
    Subscription Plans, Checkout, Billing History, Usage Dashboard
    Knowledge Base — Admin Document Library, Upload, Ingestion Progress, Extraction/Chunk Preview, Curriculum Mapping, Review & Publish, Version History, Re-index, Archive, Coverage, Retrieval Preview
    Knowledge Base — Teacher Topic Coverage Indicator, Allowed Source Selection, Grounding Status, Citation/Excerpt Viewer, Report Source Issue
25. Testing Requirements
    ⦁ Flutter: unit tests, widget tests, integration tests (including the generation wizard flow).
    ⦁ Backend: unit tests, integration tests, API tests, database tests.
    ⦁ AI/RAG layer: provider contract tests; malformed schema/citation tests; deterministic retrieval fixtures; hybrid ranking, threshold, context packing, insufficient-evidence, fallback-policy, and duplicate tests.
    ⦁ Critical flows: authentication, curriculum CRUD, guided generation end-to-end, quota enforcement, PDF generation, payment webhook handling.
    ⦁ Ingestion: malicious/unsupported files, OCR/extraction fixtures, chunk boundaries, embedding completeness, idempotent retry, publication gate, version rollback.
    ⦁ Security: cross-tenant denial, RBAC, indirect prompt-injection corpus, signed-object access, log redaction, and file-scan bypass.
    ⦁ Quality evaluation: curated queries with expected chunks; retrieval recall/precision, groundedness, citation correctness, factuality, difficulty/type adherence, and regression gates.
    ⦁ Load/recovery: concurrent ingestion/generation, filtered vector latency, provider limits, queue replay, worker failure, index rebuild, and rollback.
26. Deployment
    Flutter: Android App Bundle (AAB) → Google Play Console → Google Play Store. Future iOS/Web/Desktop support may be added.
    Backend: Nginx/HTTPS, NestJS, PostgreSQL with pgvector/full-text indexes, Redis, encrypted object storage, and independently scalable AI Generation, Ingestion/OCR, Embedding, and PDF workers. Deployments version migrations/index/configuration for rollback and expose health checks for API, queues, storage, database, embedding provider, and LLM.
27. Development Milestones
    Week Deliverable
    1 Requirements, UI/UX, architecture, curriculum and Knowledge Base domain model
    2 Database/backend foundation, PostgreSQL + pgvector, storage, queues
    3 Authentication, RBAC, tenant isolation, audit logging
    4 Curriculum management
    5 Manual question bank
    6 KB upload, quarantine, scan, storage, ingestion-job APIs
    7 Extraction/OCR, chunking, embeddings, vector/full-text indexes
    8 Curriculum mapping, review/publication/versioning, KB admin UI
    9 Retrieval Service, hybrid ranking, context packing, preview/audit
    10 RAG-grounded AI, prompt/citation validation, queue, duplicate detection
    11 Generation Wizard, coverage indicators, Review & Edit with citations
    12 Subscriptions/payments, entitlements, usage and cost controls
    13 Test builder, PDF/answer key, history, branding
    14 RAG evaluation, security/load testing, hardening, observability, deployment
28. MVP Acceptance Criteria
    ⦁ Register, verify email, and log in.
    ⦁ Create/select class, section, subject, chapter, and topic.
    ⦁ Submit a generation request with a mixed question-type quantity (e.g. 15 MCQ, 10 Short, 3 Long) and receive a job that completes successfully.
    ⦁ Generated questions respect the requested counts, types, and difficulty ratio, with no duplicates within the batch.
    ⦁ Review, edit, and regenerate individual AI-generated questions.
    ⦁ Assemble, preview, and save a test; edit and reorder questions.
    ⦁ Generate a test PDF and an answer-key PDF with school branding.
    ⦁ Enforce plan quota: a Free-plan teacher is blocked (with a clear message) once their monthly AI-question limit is reached.
    ⦁ View test history and duplicate a past test/generation configuration.
    ⦁ Complete a subscription purchase end-to-end via the payment gateway and see updated entitlements immediately.
    ⦁ Upload an allowed source and observe scan, extraction, chunking, embedding, mapping, review, and PUBLISHED status without partial publication.
    ⦁ Generate in REQUIRED mode using only published topic-mapped content; every accepted question has a valid document-version/page/section citation.
    ⦁ No relevant source returns INSUFFICIENT_KNOWLEDGE with no accepted questions and no AI-question quota charge.
    ⦁ A School user cannot retrieve, preview, or open citations from another School's private KB.
    ⦁ A new document version affects new retrievals while historical questions resolve original citations.
29. Risks & Assumptions
    Risk Mitigation
    AI-generated questions contain factual/curriculum errors Mandatory teacher review, grounding in published curriculum content, question-level citations, evidence validation, and source inspection before finalising.
    AI provider latency/outage Asynchronous job queue with retries and timeout fallback; provider-agnostic adapter enables a secondary provider.
    Runaway AI cost from abuse Hard per-plan quotas, per-request ceilings, per-teacher/IP rate limiting, cost logging and alerting.
    Duplicate/near-duplicate questions across generations Embedding-based similarity checks against batch, bank, and recent-test history (FR-23).
    Payment/webhook desync leaving stale entitlements Webhooks are the source of truth; scheduled reconciliation job cross-checks provider status against local subscription state.
    Curriculum data inconsistency across boards Strict admin-managed curriculum hierarchy with validation; teachers cannot create ad-hoc top-level curriculum nodes.
    Poor OCR/extraction/chunk boundaries reduce retrieval quality Preview extracted text/chunks; track confidence/coverage; use structure-aware chunking; review before publication; support reprocessing/versioning.
    No sufficiently relevant source for a selected topic Coverage dashboard/preflight; REQUIRED mode returns INSUFFICIENT_KNOWLEDGE without charge; administrators add/remap content.
    Indirect prompt injection inside uploaded content Quarantine/scan, strip active content, delimit evidence, enforce precedence and no-tool/no-secret contract, validate output.
    Cross-tenant Knowledge Base leakage Tenant filters/RLS before scoring, scoped object access, RBAC, negative tests, and audit alerts.
    Stale embeddings or index/model changes alter results Version embeddings/chunking/prompts/retrieval; shadow re-index, evaluation gate, atomic switch, rollback.
    Copyright/licensing breach for textbooks Require rights metadata/attestation, restricted publisher roles, retention/takedown workflow, and audited publication.
    Assumption: approved external or self-hosted LLM and embedding providers are available, and the organisation has permission to ingest/process the educational content supplied to the Knowledge Base.
30. Product Roadmap
    Version Focus
    1.0 — Manual Test Builder Authentication, academic management, manual question bank, manual test builder, PDF, answer key. (Legacy v1.0 baseline)
    2.0 — AI Test Generator Guided AI generation, mixed question sets, subscription enforcement, and review gate.
    2.5 — Professional Teacher Edition Excel/CSV/Word import, multiple test versions, templates, advanced branding.
    3.0 — School Platform Multi-teacher schools, shared question banks, online tests, students, results, analytics.
    4.0 — Educational SaaS Multi-school tenancy, curriculum/question marketplace, advanced subscriptions and payments.
    2.2 — RAG-Grounded Test Generator (this SRS) Dedicated Knowledge Base, ingestion/OCR, pgvector hybrid retrieval, curriculum mapping, grounded prompts, citations, tenant security, and RAG evaluation.
31. Recommended Final Architecture
    Flutter and responsive Web Admin → NestJS REST API → PostgreSQL + pgvector, Redis, and encrypted object storage. Curriculum, Knowledge Base/Ingestion, Retrieval, AI Generation, Question Bank, Tests/PDF, Subscriptions/Payments, and Notifications are independent modules connected through queues and shared tenant/curriculum identities. Retrieval is the only route from published KB content into generation prompts; questions and citations persist transactionally.

32. Entity Relationship Diagram
    The diagram below shows the full entity set and cardinalities across the curriculum hierarchy, question/test domain, AI generation domain, and subscription/billing domain. Field-level detail for every table is listed in § 23.

Figure 1 — Entity Relationship Diagram (full system)
23a. System Sequence — AI Generation Call Path
This sequence view complements the flow diagram in § 25.2: it shows which component talks to which across the client, API, queue, worker, AI provider, and database for a single generation request.

Figure 2 — Sequence: guided request through RAG retrieval, AI provider, citation validation, and persistence

23. Detailed Database Schema (Field-Level)
    Every table from § 9 is expanded below to column level: name, data type, constraints, and purpose. Types are given in PostgreSQL notation. All tables include id (uuid, PK, default gen_random_uuid()) unless noted, and created_at / updated_at (timestamptz, default now()) audit columns, omitted below for brevity except where they carry extra meaning.
    23.1 Curriculum Hierarchy
    boards
    Column Type Constraints Description
    id uuid PK Board identifier
    name varchar(120) NOT NULL, UNIQUE e.g. “Cambridge”, “Federal Board”
    description text NULL Optional notes
    classes
    Column Type Constraints Description
    id uuid PK Class identifier
    board_id uuid FK → boards.id, NOT NULL Owning board
    name varchar(60) NOT NULL e.g. “Class 9”
    created_by uuid FK → users.id, NULL Admin/teacher who created it
    sections
    Column Type Constraints Description
    id uuid PK Section identifier
    class_id uuid FK → classes.id, NOT NULL Owning class
    name varchar(30) NOT NULL e.g. “A”, “B”
    subjects
    Column Type Constraints Description
    id uuid PK Subject identifier
    class_id uuid FK → classes.id, NOT NULL Owning class
    board_id uuid FK → boards.id, NOT NULL Denormalised for fast filtering
    name varchar(80) NOT NULL e.g. “Physics”
    language varchar(20) NOT NULL, default 'en' Content language
    description text NULL Optional syllabus notes
    chapters
    Column Type Constraints Description
    id uuid PK Chapter identifier
    subject_id uuid FK → subjects.id, NOT NULL Owning subject
    chapter_number int NOT NULL Display order
    name varchar(120) NOT NULL e.g. “Force and Motion”
    description text NULL Optional overview
    topics
    Column Type Constraints Description
    id uuid PK Topic identifier — smallest AI-scoping unit
    chapter_id uuid FK → chapters.id, NOT NULL Owning chapter
    name varchar(150) NOT NULL e.g. “Newton's First Law”
    description text NULL Curriculum summary for query construction and approved fallback context; not a substitute for published KB evidence
    order int NOT NULL, default 0 Display order within chapter
    23.2 Identity & Organisation
    schools
    Column Type Constraints Description
    id uuid PK School identifier
    name varchar(150) NOT NULL School/institution name
    logo_url text NULL Object-storage URL
    address text NULL
    phone varchar(30) NULL
    email varchar(150) NULL
    website varchar(150) NULL
    users
    Column Type Constraints Description
    id uuid PK User identifier
    school_id uuid FK → schools.id, NULL Set for School-plan teachers/admins
    name varchar(120) NOT NULL
    email varchar(150) NOT NULL, UNIQUE
    phone varchar(30) NULL
    password_hash varchar(255) NOT NULL bcrypt/argon2 hash
    role enum NOT NULL TEACHER | SCHOOL_ADMIN | SYSTEM_ADMIN | STUDENT (future)
    profile_image text NULL Object-storage URL
    email_verified boolean NOT NULL, default false
    status enum NOT NULL, default 'ACTIVE' ACTIVE | SUSPENDED | DELETED
    23.3 Questions & Tests
    questions
    Column Type Constraints Description
    id uuid PK Question identifier
    topic_id uuid FK → topics.id, NOT NULL Most granular scope link
    chapter_id / subject_id / class_id uuid FK, NOT NULL (denormalised) Fast filtering without joins
    type enum NOT NULL MCQ | SHORT | LONG | TRUE_FALSE | FILL_BLANK
    question_text text NOT NULL
    difficulty enum NOT NULL EASY | MEDIUM | HARD
    marks numeric(5,2) NOT NULL
    explanation text NULL Model answer / rationale
    source enum NOT NULL AI_GENERATED | MANUAL
    review_status enum NOT NULL, default 'PENDING' PENDING | APPROVED (FR-40)
    generation_job_id uuid FK → generation_jobs.id, NULL Set only when source = AI_GENERATED
    created_by uuid FK → users.id, NOT NULL
    status enum NOT NULL, default 'ACTIVE' ACTIVE | ARCHIVED
    grounding_status enum NOT NULL, default 'NOT_APPLICABLE' NOT_APPLICABLE | GROUNDED | UNGROUNDED | INSUFFICIENT_EVIDENCE
    retrieval_event_id uuid FK → retrieval_events.id, NULL Primary retrieval trace; detailed evidence is in question_citations
    question_options
    Column Type Constraints Description
    id uuid PK
    question_id uuid FK → questions.id, NOT NULL Applies to MCQ (and optionally True/False)
    option_text text NOT NULL
    option_order int NOT NULL Display order (A/B/C/D)
    is_correct boolean NOT NULL, default false Exactly one true per MCQ question — enforced at application layer + DB check
    tests
    Column Type Constraints Description
    id uuid PK
    title varchar(200) NOT NULL
    class_id / section_id / subject_id uuid FK, NOT NULL Scope of the test
    created_by uuid FK → users.id, NOT NULL
    duration int NOT NULL Minutes
    total_marks numeric(6,2) NOT NULL Computed from test_questions
    instructions text NULL
    status enum NOT NULL, default 'DRAFT' DRAFT | GENERATED | FINAL | ARCHIVED
    test_questions
    Column Type Constraints Description
    id uuid PK
    test_id uuid FK → tests.id, NOT NULL
    question_id uuid FK → questions.id, NOT NULL
    section varchar(60) NULL e.g. “Section A — MCQs”
    question_number int NOT NULL Printed number on the paper
    marks numeric(5,2) NOT NULL May override the question's default marks for this test
    sort_order int NOT NULL Drag-and-drop order (FR-28)
    23.4 AI Generation
    generation_jobs
    Column Type Constraints Description
    id uuid PK
    requested_by uuid FK → users.id, NOT NULL
    request_payload jsonb NOT NULL Full request as submitted (see § 7.4)
    status enum NOT NULL, default 'QUEUED' QUEUED | PROCESSING | PARTIAL | COMPLETED | FAILED
    requested_count int NOT NULL Total questions requested across all units
    generated_count int NOT NULL, default 0 Total accepted so far
    model varchar(80) NOT NULL Model identifier used
    provider varchar(40) NOT NULL AI provider adapter used
    token_usage int NULL Total tokens consumed (cost tracking)
    cost numeric(10,4) NULL Estimated cost in USD
    completed_at timestamptz NULL
    grounding_mode enum NOT NULL, default 'REQUIRED' REQUIRED | PREFERRED | DISABLED (admin-controlled)
    retrieval_strategy_version varchar(80) NULL Versioned retrieval/chunking/reranking configuration
    embedding_model varchar(120) NULL Embedding model/version used for retrieval
    generation_job_items
    Column Type Constraints Description
    id uuid PK
    generation_job_id uuid FK → generation_jobs.id, NOT NULL
    question_id uuid FK → questions.id, NULL NULL until the item is accepted and persisted
    unit_topic_id uuid FK → topics.id, NOT NULL Which unit this item belongs to
    unit_type enum NOT NULL MCQ | SHORT | LONG | TRUE_FALSE | FILL_BLANK
    retry_count int NOT NULL, default 0
    rejection_reason varchar(120) NULL e.g. “DUPLICATE”, “SCHEMA_INVALID”
    retrieval_event_id uuid FK → retrieval_events.id, NULL Evidence retrieval trace for this unit
    grounding_status enum NOT NULL GROUNDED | UNGROUNDED | INSUFFICIENT_KNOWLEDGE
    23.5 Knowledge Base & RAG
    knowledge_documents
    Column Type Constraints Description
    id uuid PK Knowledge document identifier
    school_id uuid FK → schools.id, NULL NULL for GLOBAL; set for school-private content
    tenant_scope enum NOT NULL GLOBAL | SCHOOL
    title varchar(240) NOT NULL Source title
    source_type enum NOT NULL TEXTBOOK | SYLLABUS | NOTES | POLICY | OTHER
    language varchar(20) NOT NULL Primary language
    rights_metadata jsonb NOT NULL, default '{}' Licence, owner, permission/attestation, retention
    status enum NOT NULL DRAFT | PROCESSING | READY_FOR_REVIEW | PUBLISHED | FAILED | ARCHIVED
    active_version_id uuid FK → document_versions.id, NULL Published version
    created_by uuid FK → users.id, NOT NULL Uploader
    document_versions
    Column Type Constraints Description
    id uuid PK Immutable version
    document_id uuid FK → knowledge_documents.id, NOT NULL Owning document
    version_no int NOT NULL Monotonic version
    storage_key text NOT NULL Encrypted object key
    checksum varchar(128) NOT NULL File checksum
    mime_type varchar(120) NOT NULL Validated type
    page_count int NULL Extracted pages
    extraction_status enum NOT NULL PENDING | RUNNING | SUCCEEDED | FAILED
    published_at / archived_at timestamptz NULL Lifecycle timestamps
    ingestion_jobs
    Column Type Constraints Description
    id uuid PK Job identifier
    document_version_id uuid FK → document_versions.id, NOT NULL Version processed
    status enum NOT NULL QUEUED | PROCESSING | READY_FOR_REVIEW | COMPLETED | FAILED
    current_step enum NOT NULL SCAN | EXTRACT | OCR | NORMALISE | CHUNK | EMBED | VERIFY
    error_code / detail text NULL Safe failure detail
    metrics jsonb NOT NULL, default '{}' Pages, chars, chunks, embeddings, duration, warnings
    started_at / completed_at timestamptz NULL Execution timestamps
    content_chunks
    Column Type Constraints Description
    id uuid PK Chunk identifier
    document_version_id uuid FK → document_versions.id, NOT NULL Immutable source
    chunk_index int NOT NULL Source order
    content text NOT NULL Normalised text
    page_start / page_end int NULL Page locator
    section_path text NULL Heading locator
    token_count int NOT NULL Context estimate
    content_hash varchar(128) NOT NULL Integrity/dedup hash
    embedding vector(n) NOT NULL pgvector embedding
    embedding_model varchar(120) NOT NULL Provider/model/version
    document_topic_mappings
    Column Type Constraints Description
    id uuid PK Mapping identifier
    document_version_id uuid FK → document_versions.id, NOT NULL Mapped version
    board/class/subject ids uuid FK, NULL as applicable Curriculum filters
    chapter/topic ids uuid FK, NULL as applicable Most-specific scope
    status enum NOT NULL DRAFT | APPROVED | REJECTED
    mapped_by / approved_by uuid FK → users.id Governance actors
    retrieval_events
    Column Type Constraints Description
    id uuid PK Retrieval identifier
    generation_job/item ids uuid FK, NOT NULL Originating generation unit
    query_text text NOT NULL Constructed query
    filters jsonb NOT NULL Tenant/curriculum/language/version/publication filters
    strategy_version varchar(80) NOT NULL Hybrid/reranker/context config
    top_k / threshold numeric NOT NULL Parameters
    selected_chunks jsonb NOT NULL Ordered IDs and scores
    status enum NOT NULL SUCCEEDED | INSUFFICIENT_KNOWLEDGE | FAILED
    latency_ms int NOT NULL Latency
    question_citations
    Column Type Constraints Description
    id uuid PK Citation identifier
    question_id uuid FK → questions.id, NOT NULL Grounded question
    retrieval_event_id uuid FK → retrieval_events.id, NOT NULL Retrieval trace
    content_chunk_id uuid FK → content_chunks.id, NOT NULL Evidence chunk
    document_version_id uuid FK → document_versions.id, NOT NULL Immutable source
    locator jsonb NOT NULL Page/section/heading
    excerpt_hash varchar(128) NOT NULL Evidence hash
    retrieval_score numeric(6,5) NULL Relevance score
    citation_order int NOT NULL Display order
    23.6 Subscriptions & Billing
    plans
    Column Type Constraints Description
    id uuid PK
    name varchar(60) NOT NULL, UNIQUE Free | Teacher Pro | School
    price numeric(10,2) NOT NULL
    billing_interval enum NOT NULL MONTHLY | YEARLY
    ai_question_limit int NULL NULL = unlimited
    test_limit int NULL NULL = unlimited
    features jsonb NOT NULL, default '{}' Feature flags (branding, versions, imports…)
    subscriptions
    Column Type Constraints Description
    id uuid PK
    user_id uuid FK → users.id, NULL Set for Free/Pro individual subscriptions
    school_id uuid FK → schools.id, NULL Set for School-plan subscriptions (pooled)
    plan_id uuid FK → plans.id, NOT NULL
    status enum NOT NULL TRIALING | ACTIVE | PAST_DUE | CANCELLED | EXPIRED
    current_period_start timestamptz NOT NULL
    current_period_end timestamptz NOT NULL
    payment_provider_ref varchar(120) NULL External subscription/customer ID
    usage_counters
    Column Type Constraints Description
    id uuid PK
    subscription_id uuid FK → subscriptions.id, NOT NULL
    cycle_start date NOT NULL Start of the current billing cycle
    ai_questions_used int NOT NULL, default 0
    tests_created int NOT NULL, default 0
    pdf_exports int NOT NULL, default 0
    payments
    Column Type Constraints Description
    id uuid PK
    subscription_id uuid FK → subscriptions.id, NOT NULL
    amount numeric(10,2) NOT NULL
    currency varchar(3) NOT NULL, default 'USD'
    status enum NOT NULL SUCCEEDED | FAILED | REFUNDED | PENDING
    provider varchar(40) NOT NULL e.g. “stripe”
    provider_ref varchar(120) NOT NULL External payment/charge ID
    audit_logs
    Column Type Constraints Description
    id uuid PK
    actor_id uuid FK → users.id, NULL NULL for system-initiated actions
    action varchar(80) NOT NULL e.g. “GENERATION_REQUESTED”, “PLAN_UPGRADED”
    entity_type varchar(60) NOT NULL e.g. “generation_job”
    entity_id uuid NULL
    metadata jsonb NULL Free-form structured context
24. User & Teacher Journey Maps
    24.1 Teacher Journey (Primary User)
    From first install through habitual use. The teacher normally does not ingest content; the wizard shows KB coverage, generation progress shows retrieval, and review exposes citations and grounding warnings.

Figure 3 — Teacher journey: onboarding → first test → habitual use → conversion
24.2 School Administrator Journey
Applies to School-plan accounts. School Administrators upload permitted content, monitor ingestion, map it to curriculum, preview chunks, publish versions, inspect coverage, and resolve reported source issues.

Figure 4 — School Administrator journey: setup → Knowledge Base governance → retrieval/quality oversight
 25. System Flow Diagrams
25.1 Authentication & Subscription Flow

Figure 5 — Authentication flow (left) continues into the subscription/checkout flow (right)
25.2 Guided AI Test Generation Flow
This expands the summary table in § 5 into a full decision flow, split into two parts for readability.

Figure 6a — Generation flow, Part A: guided selection & request submission

Figure 6b — Generation flow, Part B: RAG retrieval, grounded processing, citation review, assembly & export

Document Status: Master SRS v2.2 — RAG/Knowledge Base integrated; approved for MVP planning and implementation.
