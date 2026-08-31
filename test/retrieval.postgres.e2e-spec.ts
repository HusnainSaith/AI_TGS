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
import { AuditModule } from '../src/modules/audit/audit.module';
import { Board } from '../src/modules/curriculum/curriculum.entities';
import { CurriculumModule } from '../src/modules/curriculum/curriculum.module';
import { EmbeddingsModule } from '../src/modules/embeddings/embeddings.module';
import { EmbeddingConfigService } from '../src/modules/embeddings/embedding-config.service';
import { ContentChunkEmbedding } from '../src/modules/embeddings/entities/content-chunk-embedding.entity';
import { EmbeddingStatus } from '../src/modules/embeddings/embedding.enums';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../src/infrastructure/providers/provider.contracts';
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
import { DocumentMappingsService } from '../src/modules/knowledge-base/document-mappings.service';
import { KnowledgeBaseService } from '../src/modules/knowledge-base/knowledge-base.service';
import { RetrievalEventChunk } from '../src/modules/retrieval/entities/retrieval-event-chunk.entity';
import { RetrievalEvent } from '../src/modules/retrieval/entities/retrieval-event.entity';
import { RetrievalModule } from '../src/modules/retrieval/retrieval.module';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { School } from '../src/modules/schools/school.entity';
import { User } from '../src/modules/users/user.entity';

const run = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

run('Atomic publication and hybrid retrieval with PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let retrieval: RetrievalService;
  let mappings: DocumentMappingsService;
  let knowledgeBase: KnowledgeBaseService;
  let provider: EmbeddingProvider;
  let embeddingConfig: EmbeddingConfigService;
  const ids = {
    system: randomUUID(),
    adminA: randomUUID(),
    adminB: randomUUID(),
    schoolA: randomUUID(),
    schoolB: randomUUID(),
    board: randomUUID(),
    globalDocument: randomUUID(),
    schoolADocument: randomUUID(),
    schoolBDocument: randomUUID(),
    globalVersion: randomUUID(),
    schoolAVersion: randomUUID(),
    schoolBVersion: randomUUID(),
  };
  const systemUser: AuthenticatedUser = {
    id: ids.system,
    email: `${ids.system}@test.invalid`,
    role: UserRole.SYSTEM_ADMIN,
    schoolId: null,
    emailVerified: true,
  };
  const adminA: AuthenticatedUser = {
    id: ids.adminA,
    email: `${ids.adminA}@test.invalid`,
    role: UserRole.SCHOOL_ADMIN,
    schoolId: ids.schoolA,
    emailVerified: true,
  };
  const adminB: AuthenticatedUser = {
    id: ids.adminB,
    email: `${ids.adminB}@test.invalid`,
    role: UserRole.SCHOOL_ADMIN,
    schoolId: ids.schoolB,
    emailVerified: true,
  };
  const content = 'Photosynthesis uses chlorophyll to convert light energy into chemical energy.';

  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = 'test';
    process.env.EMBEDDING_MODEL = 'deterministic-test-v1';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        CurriculumModule,
        EmbeddingsModule,
        KnowledgeBaseModule,
        RetrievalModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    retrieval = app.get(RetrievalService);
    mappings = app.get(DocumentMappingsService);
    knowledgeBase = app.get(KnowledgeBaseService);
    provider = app.get(EMBEDDING_PROVIDER);
    embeddingConfig = app.get(EmbeddingConfigService);

    await db.getRepository(School).insert([
      { id: ids.schoolA, name: `Retrieval A ${ids.schoolA}` },
      { id: ids.schoolB, name: `Retrieval B ${ids.schoolB}` },
    ]);
    const passwordHash = await hash(randomUUID());
    await db.getRepository(User).insert([
      { ...systemUser, name: 'system', passwordHash },
      { ...adminA, name: 'admin-a', passwordHash },
      { ...adminB, name: 'admin-b', passwordHash },
    ]);
    await db.getRepository(Board).insert({ id: ids.board, name: `Retrieval board ${ids.board}` });

    const documents = [
      [ids.globalDocument, ids.globalVersion, TenantScope.GLOBAL, null, ids.system],
      [ids.schoolADocument, ids.schoolAVersion, TenantScope.SCHOOL, ids.schoolA, ids.adminA],
      [ids.schoolBDocument, ids.schoolBVersion, TenantScope.SCHOOL, ids.schoolB, ids.adminB],
    ] as const;
    const active = embeddingConfig.active();
    const embedded = await provider.embed(content);
    for (const [documentId, versionId, tenantScope, schoolId, actorId] of documents) {
      await db.getRepository(KnowledgeDocument).insert({
        id: documentId,
        tenantScope,
        schoolId,
        title: `Retrieval source ${documentId}`,
        sourceType: KnowledgeSourceType.TXT,
        language: 'en',
        rightsMetadata: { permissionConfirmed: true, sourceOwner: 'e2e' },
        status: KnowledgeDocumentStatus.READY_FOR_REVIEW,
        createdBy: actorId,
      });
      await db.getRepository(DocumentVersion).insert({
        id: versionId,
        documentId,
        versionNo: 1,
        storageKey: `test/${versionId}`,
        checksum: versionId.replaceAll('-', '').padEnd(64, '0'),
        mimeType: 'text/plain',
        validatedMimeType: 'text/plain',
        originalFilename: 'retrieval.txt',
        fileSize: content.length,
        extractionStatus: ExtractionStatus.COMPLETED,
        malwareScanStatus: MalwareScanStatus.CLEAN,
      });
      const chunk = await db.getRepository(ContentChunk).save({
        documentVersionId: versionId,
        tenantScope,
        schoolId,
        content,
        contentHash: createHash('sha256').update(content).digest('hex'),
        estimatedTokenCount: 15,
        locatorMetadata: { type: 'TEXT_LINES', lineFrom: 1, lineTo: 1 },
        chunkOrder: 1,
      });
      await db.getRepository(DocumentTopicMapping).insert({
        documentVersionId: versionId,
        boardId: ids.board,
        classId: null,
        subjectId: null,
        chapterId: null,
        topicId: null,
        status: MappingStatus.APPROVED,
        mappedBy: actorId,
        approvedBy: actorId,
        approvedAt: new Date(),
      });
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
        embedding: `[${embedded.vector.join(',')}]`,
        embeddedAt: new Date(),
        errorCode: null,
        usageMetadata: null,
      });
    }
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      const users = [ids.system, ids.adminA, ids.adminB];
      const versions = [ids.globalVersion, ids.schoolAVersion, ids.schoolBVersion];
      const documents = [ids.globalDocument, ids.schoolADocument, ids.schoolBDocument];
      await db.query(
        `DELETE FROM retrieval_event_chunks WHERE retrieval_event_id IN (SELECT id FROM retrieval_events WHERE requested_by=ANY($1::uuid[]))`,
        [users],
      );
      await db.query(`DELETE FROM retrieval_events WHERE requested_by=ANY($1::uuid[])`, [users]);
      await db.query(`DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])`, [users]);
      await db.query(
        `DELETE FROM content_chunk_embeddings WHERE content_chunk_id IN (SELECT id FROM content_chunks WHERE document_version_id=ANY($1::uuid[]))`,
        [versions],
      );
      await db
        .getRepository(DocumentTopicMapping)
        .delete(versions.map((documentVersionId) => ({ documentVersionId })));
      await db
        .getRepository(ContentChunk)
        .delete(versions.map((documentVersionId) => ({ documentVersionId })));
      await db.query(
        `UPDATE knowledge_documents SET active_version_id=NULL WHERE id=ANY($1::uuid[])`,
        [documents],
      );
      await db.getRepository(DocumentVersion).delete(versions);
      await db.getRepository(KnowledgeDocument).delete(documents);
      await db.getRepository(Board).delete(ids.board);
      await db.getRepository(User).delete(users);
      await db.getRepository(School).delete([ids.schoolA, ids.schoolB]);
    }
    await app?.close();
  });

  it('publishes atomically and retrieves only GLOBAL plus own-school candidates', async () => {
    await mappings.publish(ids.globalVersion, systemUser);
    await mappings.publish(ids.schoolAVersion, adminA);
    await mappings.publish(ids.schoolBVersion, adminB);
    const published = await db
      .getRepository(KnowledgeDocument)
      .findByIds([ids.globalDocument, ids.schoolADocument, ids.schoolBDocument]);
    expect(published.every((item) => item.status === KnowledgeDocumentStatus.PUBLISHED)).toBe(true);
    expect(published.map((item) => item.activeVersionId).sort()).toEqual(
      [ids.globalVersion, ids.schoolAVersion, ids.schoolBVersion].sort(),
    );

    const result = await retrieval.preview(
      { queryText: content, boardId: ids.board, topK: 10, minSimilarity: 0 },
      adminA,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.candidateCount).toBe(2);
    expect(result.selectedCount).toBe(1);
    expect(result.evidence[0]).toMatchObject({ label: 'SRC_1', vectorScore: 1 });
    expect(result.evidence.some((item) => item.documentId === ids.schoolBDocument)).toBe(false);

    const event = await db
      .getRepository(RetrievalEvent)
      .findOneByOrFail({ id: result.retrievalEventId });
    const evidence = await db
      .getRepository(RetrievalEventChunk)
      .findBy({ retrievalEventId: event.id });
    expect(event).toMatchObject({ status: 'COMPLETED', candidateCount: 2, resultCount: 1 });
    expect(evidence[0]).toMatchObject({ label: 'SRC_1', rank: 1, vectorScore: 1 });
    expect(event).not.toHaveProperty('embedding');
  });

  it('prevents documentIds tenant bypass, records insufficient knowledge, and retains history after archive', async () => {
    const denied = await retrieval.preview(
      {
        queryText: content,
        boardId: ids.board,
        documentIds: [ids.schoolBDocument],
        minSimilarity: 0,
      },
      adminA,
    );
    expect(denied).toMatchObject({
      status: 'INSUFFICIENT_KNOWLEDGE',
      candidateCount: 0,
      selectedCount: 0,
    });
    await knowledgeBase.archive(ids.schoolADocument, adminA);
    const archived = await retrieval.preview(
      {
        queryText: content,
        boardId: ids.board,
        documentIds: [ids.schoolADocument],
        minSimilarity: 0,
      },
      adminA,
    );
    expect(archived.status).toBe('INSUFFICIENT_KNOWLEDGE');
    expect(
      await db.getRepository(RetrievalEvent).exist({ where: { id: denied.retrievalEventId } }),
    ).toBe(true);
  });
});
