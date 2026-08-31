import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { configuration } from '../src/config/configuration';
import dataSourceOptions from '../src/database/data-source';
import { AI_GENERATION_PROVIDER } from '../src/modules/ai-generation/generation.contracts';
import { AiGenerationModule } from '../src/modules/ai-generation/ai-generation.module';
import { AiGenerationService } from '../src/modules/ai-generation/ai-generation.service';
import { GenerationJobItem } from '../src/modules/ai-generation/entities/generation-job-item.entity';
import { GenerationItemStatus, GroundingMode } from '../src/modules/ai-generation/generation.enums';
import { AuditModule } from '../src/modules/audit/audit.module';
import {
  Board,
  Chapter,
  CurriculumClass,
  Subject,
  Topic,
} from '../src/modules/curriculum/curriculum.entities';
import { CurriculumModule } from '../src/modules/curriculum/curriculum.module';
import { EmbeddingsModule } from '../src/modules/embeddings/embeddings.module';
import { EmbeddingConfigService } from '../src/modules/embeddings/embedding-config.service';
import { ContentChunkEmbedding } from '../src/modules/embeddings/entities/content-chunk-embedding.entity';
import { EmbeddingStatus } from '../src/modules/embeddings/embedding.enums';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../src/infrastructure/providers/provider.contracts';
import { DocumentMappingsService } from '../src/modules/knowledge-base/document-mappings.service';
import { ContentChunk } from '../src/modules/knowledge-base/entities/content-chunk.entity';
import { DocumentTopicMapping } from '../src/modules/knowledge-base/entities/document-topic-mapping.entity';
import { DocumentVersion } from '../src/modules/knowledge-base/entities/document-version.entity';
import { KnowledgeDocument } from '../src/modules/knowledge-base/entities/knowledge-document.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  MalwareScanStatus,
  MappingStatus,
  TenantScope,
} from '../src/modules/knowledge-base/enums/knowledge-base.enums';
import { KnowledgeBaseModule } from '../src/modules/knowledge-base/knowledge-base.module';
import { QuestionCitation } from '../src/modules/questions/entities/question-citation.entity';
import { Question } from '../src/modules/questions/entities/question.entity';
import {
  GroundingStatus,
  QuestionReviewStatus,
  QuestionSource,
  QuestionType,
} from '../src/modules/questions/enums/question.enums';
import { QuestionsModule } from '../src/modules/questions/questions.module';
import { RetrievalEventChunk } from '../src/modules/retrieval/entities/retrieval-event-chunk.entity';
import { RetrievalModule } from '../src/modules/retrieval/retrieval.module';
import { School } from '../src/modules/schools/school.entity';
import { User } from '../src/modules/users/user.entity';
import { Plan } from '../src/modules/subscriptions/entities/plan.entity';
import { Subscription } from '../src/modules/subscriptions/entities/subscription.entity';
import {
  BillingInterval,
  SubscriptionStatus,
} from '../src/modules/subscriptions/subscription.enums';

const run = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
run('Grounded AI generation with PostgreSQL (e2e)', () => {
  let app: INestApplication,
    db: DataSource,
    generation: AiGenerationService,
    mappings: DocumentMappingsService;
  const id = {
    school: randomUUID(),
    teacher: randomUUID(),
    other: randomUUID(),
    system: randomUUID(),
    board: randomUUID(),
    cls: randomUUID(),
    subject: randomUUID(),
    chapter: randomUUID(),
    topic: randomUUID(),
    document: randomUUID(),
    version: randomUUID(),
    plan: randomUUID(),
    subscription: randomUUID(),
  };
  const teacher: AuthenticatedUser = {
    id: id.teacher,
    email: `${id.teacher}@test.invalid`,
    role: UserRole.TEACHER,
    schoolId: id.school,
    emailVerified: true,
  };
  const other: AuthenticatedUser = {
    id: id.other,
    email: `${id.other}@test.invalid`,
    role: UserRole.TEACHER,
    schoolId: id.school,
    emailVerified: true,
  };
  const system: AuthenticatedUser = {
    id: id.system,
    email: `${id.system}@test.invalid`,
    role: UserRole.SYSTEM_ADMIN,
    schoolId: null,
    emailVerified: true,
  };
  const content =
    'Photosynthesis uses chlorophyll and sunlight to convert carbon dioxide and water into chemical energy and oxygen.';
  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = 'test';
    process.env.EMBEDDING_MODEL = 'deterministic-test-v1';
    process.env.AI_PROVIDER = 'test';
    process.env.AI_MODEL = 'deterministic-test-generation-v1';
    process.env.RAG_MIN_SIMILARITY = '0';
    const ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        CurriculumModule,
        EmbeddingsModule,
        QuestionsModule,
        KnowledgeBaseModule,
        RetrievalModule,
        AiGenerationModule,
      ],
    }).compile();
    app = ref.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    generation = app.get(AiGenerationService);
    mappings = app.get(DocumentMappingsService);
    expect(app.get(AI_GENERATION_PROVIDER)).toBeDefined();
    await db.getRepository(School).insert({ id: id.school, name: `AI E2E ${id.school}` });
    const passwordHash = await hash(randomUUID());
    await db.getRepository(User).insert([
      { ...teacher, name: 'teacher', passwordHash },
      { ...other, name: 'other', passwordHash },
      { ...system, name: 'system', passwordHash },
    ]);
    await db.getRepository(Plan).insert({
      id: id.plan,
      name: 'AI E2E Plan',
      code: `AI_E2E_${id.plan.replaceAll('-', '')}`,
      price: '0.00',
      currency: 'USD',
      billingInterval: BillingInterval.MONTHLY,
      isActive: true,
      isDefault: false,
      limits: { aiQuestionsPerPeriod: 100 },
      features: {},
    });
    await db.getRepository(Subscription).insert({
      id: id.subscription,
      userId: id.teacher,
      schoolId: null,
      planId: id.plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(Date.now() - 3600000),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      metadata: null,
    });
    await db.getRepository(Board).insert({ id: id.board, name: `AI Board ${id.board}` });
    await db
      .getRepository(CurriculumClass)
      .insert({ id: id.cls, boardId: id.board, name: 'Class 9', createdBy: id.system });
    await db.getRepository(Subject).insert({
      id: id.subject,
      boardId: id.board,
      classId: id.cls,
      name: 'Biology',
      language: 'en',
    });
    await db
      .getRepository(Chapter)
      .insert({ id: id.chapter, subjectId: id.subject, chapterNumber: 1, name: 'Plant nutrition' });
    await db.getRepository(Topic).insert({
      id: id.topic,
      chapterId: id.chapter,
      name: 'Photosynthesis',
      description: 'Energy conversion in plants',
      order: 1,
    });
    await db.getRepository(KnowledgeDocument).insert({
      id: id.document,
      tenantScope: TenantScope.GLOBAL,
      schoolId: null,
      title: 'AI grounded source',
      sourceType: KnowledgeSourceType.TXT,
      language: 'en',
      rightsMetadata: { permissionConfirmed: true, sourceOwner: 'e2e' },
      status: KnowledgeDocumentStatus.READY_FOR_REVIEW,
      createdBy: id.system,
    });
    await db.getRepository(DocumentVersion).insert({
      id: id.version,
      documentId: id.document,
      versionNo: 1,
      storageKey: `test/${id.version}`,
      checksum: createHash('sha256').update(id.version).digest('hex'),
      mimeType: 'text/plain',
      validatedMimeType: 'text/plain',
      originalFilename: 'source.txt',
      fileSize: content.length,
      extractionStatus: ExtractionStatus.COMPLETED,
      malwareScanStatus: MalwareScanStatus.CLEAN,
    });
    const chunk = await db.getRepository(ContentChunk).save({
      documentVersionId: id.version,
      tenantScope: TenantScope.GLOBAL,
      schoolId: null,
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
      estimatedTokenCount: 24,
      locatorMetadata: { type: 'TEXT_LINES', lineFrom: 1, lineTo: 1 },
      chunkOrder: 1,
    });
    await db.getRepository(DocumentTopicMapping).insert({
      documentVersionId: id.version,
      boardId: id.board,
      classId: id.cls,
      subjectId: id.subject,
      chapterId: id.chapter,
      topicId: id.topic,
      status: MappingStatus.APPROVED,
      mappedBy: id.system,
      approvedBy: id.system,
      approvedAt: new Date(),
    });
    const embeddingProvider = app.get<EmbeddingProvider>(EMBEDDING_PROVIDER),
      config = app.get(EmbeddingConfigService),
      vector = await embeddingProvider.embed(content),
      active = config.active();
    await db.getRepository(ContentChunkEmbedding).insert({
      contentChunkId: chunk.id,
      provider: active.provider,
      model: active.model,
      modelVersion: null,
      embeddingConfigVersion: active.configVersion,
      dimension: active.dimension,
      distanceMetric: active.distanceMetric,
      contentHash: chunk.contentHash,
      status: EmbeddingStatus.COMPLETED,
      embedding: `[${vector.vector.join(',')}]`,
      embeddedAt: new Date(),
      errorCode: null,
      usageMetadata: null,
    });
    await mappings.publish(id.version, system);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      const jobRows = await db.query(
        `SELECT id FROM generation_jobs WHERE requested_by=ANY($1::uuid[])`,
        [[id.teacher, id.other]],
      );
      const jobs = jobRows.map((row: { id: string }) => row.id);
      if (jobs.length) {
        await db.query(`DELETE FROM usage_ledger WHERE subscription_id=$1`, [id.subscription]);
        await db.query(`DELETE FROM usage_reservations WHERE subscription_id=$1`, [
          id.subscription,
        ]);
        await db.query(`DELETE FROM usage_counters WHERE subscription_id=$1`, [id.subscription]);
        await db.query(
          `UPDATE generation_job_items SET question_id=NULL WHERE generation_job_id=ANY($1::uuid[])`,
          [jobs],
        );
        await db.query(
          `DELETE FROM question_citations WHERE question_id IN (SELECT id FROM questions WHERE generation_job_id=ANY($1::uuid[]))`,
          [jobs],
        );
        await db.query(`DELETE FROM questions WHERE generation_job_id=ANY($1::uuid[])`, [jobs]);
        await db.query(`DELETE FROM generation_job_items WHERE generation_job_id=ANY($1::uuid[])`, [
          jobs,
        ]);
        await db.query(`DELETE FROM generation_jobs WHERE id=ANY($1::uuid[])`, [jobs]);
      }
      await db.query(`DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])`, [
        [id.teacher, id.other, id.system],
      ]);
      await db.query(
        `DELETE FROM retrieval_event_chunks WHERE retrieval_event_id IN (SELECT id FROM retrieval_events WHERE requested_by=ANY($1::uuid[]))`,
        [[id.teacher, id.other]],
      );
      await db.query(`DELETE FROM retrieval_events WHERE requested_by=ANY($1::uuid[])`, [
        [id.teacher, id.other],
      ]);
      await db.query(`UPDATE knowledge_documents SET active_version_id=NULL WHERE id=$1`, [
        id.document,
      ]);
      await db.query(
        `DELETE FROM content_chunk_embeddings WHERE content_chunk_id IN (SELECT id FROM content_chunks WHERE document_version_id=$1)`,
        [id.version],
      );
      await db.getRepository(DocumentTopicMapping).delete({ documentVersionId: id.version });
      await db.getRepository(ContentChunk).delete({ documentVersionId: id.version });
      await db.getRepository(DocumentVersion).delete(id.version);
      await db.getRepository(KnowledgeDocument).delete(id.document);
      await db.getRepository(Topic).delete(id.topic);
      await db.getRepository(Chapter).delete(id.chapter);
      await db.getRepository(Subject).delete(id.subject);
      await db.getRepository(CurriculumClass).delete(id.cls);
      await db.getRepository(Board).delete(id.board);
      await db.getRepository(Subscription).delete(id.subscription);
      await db.getRepository(Plan).delete(id.plan);
      await db.getRepository(User).delete([id.teacher, id.other, id.system]);
      await db.getRepository(School).delete(id.school);
    }
    await app?.close();
  });
  const request = (documentIds?: string[]) => ({
    classId: id.cls,
    subjectId: id.subject,
    units: [
      {
        chapterId: id.chapter,
        topicId: id.topic,
        questionMix: [
          { type: QuestionType.MCQ, count: 1, difficulty: { easy: 1, medium: 0, hard: 0 } },
          { type: QuestionType.SHORT, count: 1, difficulty: { easy: 0, medium: 1, hard: 0 } },
        ],
      },
    ],
    language: 'en',
    knowledgeBase: { mode: GroundingMode.REQUIRED, documentIds: documentIds ?? [] },
  });
  it('creates, processes, grounds, cites, authorizes, and regenerates without overwriting history', async () => {
    const created = await generation.create(request(), teacher);
    expect(created).toMatchObject({ status: 'QUEUED', requestedCount: 2, itemCount: 2 });
    await expect(generation.get(created.id, other)).rejects.toThrow('permission');
    const processed = await generation.process(created.id, teacher);
    expect(processed).toMatchObject({ status: 'COMPLETED', generatedCount: 2 });
    const questions = await db.getRepository(Question).findBy({ generationJobId: created.id });
    expect(questions).toHaveLength(2);
    expect(
      questions.every(
        (q) =>
          q.source === QuestionSource.AI_GENERATED &&
          q.reviewStatus === QuestionReviewStatus.PENDING &&
          q.groundingStatus === GroundingStatus.GROUNDED &&
          q.createdBy === id.teacher,
      ),
    ).toBe(true);
    const options = await db.query(
      `SELECT q.type,count(o.id)::int count,sum(CASE WHEN o.is_correct THEN 1 ELSE 0 END)::int correct FROM questions q LEFT JOIN question_options o ON o.question_id=q.id WHERE q.generation_job_id=$1 GROUP BY q.type`,
      [created.id],
    );
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'MCQ', count: 4, correct: 1 }),
        expect.objectContaining({ type: 'SHORT', count: 0 }),
      ]),
    );
    const citations = await db
      .getRepository(QuestionCitation)
      .findBy(questions.map((question) => ({ questionId: question.id })));
    expect(citations).toHaveLength(2);
    const selected = await db
      .getRepository(RetrievalEventChunk)
      .findBy({ retrievalEventId: citations[0]!.retrievalEventId });
    expect(
      selected.some(
        (e) =>
          e.contentChunkId === citations[0]!.contentChunkId &&
          e.contentHash === citations[0]!.excerptHash,
      ),
    ).toBe(true);
    const item = (await generation.listItems(created.id, teacher))[0]!;
    const before = questions.length;
    const regenerated = await generation.regenerate(created.id, item.id, teacher);
    expect(['COMPLETED', 'PARTIAL']).toContain(regenerated.status);
    expect(
      await db.getRepository(Question).countBy({ generationJobId: created.id }),
    ).toBeGreaterThan(before);
    await generation.cancel(created.id, teacher);
    expect((await generation.get(created.id, teacher)).errorCode).toBe('AI_JOB_CANCELLED');
    expect(
      await db.getRepository(Question).countBy({ generationJobId: created.id }),
    ).toBeGreaterThan(0);
  });
  it('does not call generation or create questions when REQUIRED retrieval is insufficient', async () => {
    const created = await generation.create(request([randomUUID()]), teacher);
    const result = await generation.process(created.id, teacher);
    expect(result.status).toBe('FAILED');
    expect(result.generatedCount).toBe(0);
    const items = await db.getRepository(GenerationJobItem).findBy({ generationJobId: created.id });
    expect(items.every((item) => item.status === GenerationItemStatus.INSUFFICIENT_KNOWLEDGE)).toBe(
      true,
    );
    expect(await db.getRepository(Question).countBy({ generationJobId: created.id })).toBe(0);
  });
});
