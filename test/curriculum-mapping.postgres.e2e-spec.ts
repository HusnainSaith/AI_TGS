import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/common/guards/verified-email.guard';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { UserRole } from '../src/common/enums/user-role.enum';
import { configuration } from '../src/config/configuration';
import dataSourceOptions from '../src/database/data-source';
import { AuditModule } from '../src/modules/audit/audit.module';
import {
  Board,
  Chapter,
  CurriculumClass,
  Subject,
  Topic,
} from '../src/modules/curriculum/curriculum.entities';
import { CurriculumModule } from '../src/modules/curriculum/curriculum.module';
import { CurriculumStatus } from '../src/modules/curriculum/curriculum-status.enum';
import { ContentChunk } from '../src/modules/knowledge-base/entities/content-chunk.entity';
import { DocumentTopicMapping } from '../src/modules/knowledge-base/entities/document-topic-mapping.entity';
import { DocumentVersion } from '../src/modules/knowledge-base/entities/document-version.entity';
import { KnowledgeDocument } from '../src/modules/knowledge-base/entities/knowledge-document.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  MalwareScanStatus,
  TenantScope,
} from '../src/modules/knowledge-base/enums/knowledge-base.enums';
import { KnowledgeBaseModule } from '../src/modules/knowledge-base/knowledge-base.module';
import { School } from '../src/modules/schools/school.entity';
import { User } from '../src/modules/users/user.entity';

class TestAuthGuard implements CanActivate {
  canActivate(c: ExecutionContext) {
    if (!c.switchToHttp().getRequest<{ user?: unknown }>().user) throw new UnauthorizedException();
    return true;
  }
}
const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
describeDatabase('Curriculum mapping/review API with local PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  const id = {
    system: randomUUID(),
    adminA: randomUUID(),
    adminB: randomUUID(),
    teacher: randomUUID(),
    schoolA: randomUUID(),
    schoolB: randomUUID(),
    board: randomUUID(),
    cls: randomUUID(),
    subject: randomUUID(),
    chapter: randomUUID(),
    topic: randomUUID(),
    archivedTopic: randomUUID(),
    docA: randomUUID(),
    docB: randomUUID(),
    versionA: randomUUID(),
    versionB: randomUUID(),
  };
  const api = () => request(app.getHttpServer());
  const as = (call: request.Test, user: string, role: UserRole, school: string | null = null) =>
    call
      .set('x-test-user', user)
      .set('x-test-role', role)
      .set('x-test-school', school ?? '');
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        CurriculumModule,
        KnowledgeBaseModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: VerifiedEmailGuard },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.use(
      (
        req: { user?: unknown; headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers['x-test-user'])
          req.user = {
            id: req.headers['x-test-user'],
            email: 'map@test.invalid',
            role: req.headers['x-test-role'],
            schoolId: req.headers['x-test-school'] || null,
            emailVerified: true,
          };
        next();
      },
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
    db = app.get(DataSource);
    await db.getRepository(School).insert([
      { id: id.schoolA, name: `Map A ${id.schoolA}` },
      { id: id.schoolB, name: `Map B ${id.schoolB}` },
    ]);
    const passwordHash = await hash(randomUUID());
    await db.getRepository(User).insert([
      {
        id: id.system,
        name: 'system',
        email: `${id.system}@test.invalid`,
        passwordHash,
        role: UserRole.SYSTEM_ADMIN,
        emailVerified: true,
        schoolId: null,
      },
      {
        id: id.adminA,
        name: 'admin-a',
        email: `${id.adminA}@test.invalid`,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        emailVerified: true,
        schoolId: id.schoolA,
      },
      {
        id: id.adminB,
        name: 'admin-b',
        email: `${id.adminB}@test.invalid`,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        emailVerified: true,
        schoolId: id.schoolB,
      },
      {
        id: id.teacher,
        name: 'teacher',
        email: `${id.teacher}@test.invalid`,
        passwordHash,
        role: UserRole.TEACHER,
        emailVerified: true,
        schoolId: id.schoolA,
      },
    ]);
    await db.getRepository(Board).insert({ id: id.board, name: `Mapping board ${id.board}` });
    await db
      .getRepository(CurriculumClass)
      .insert({ id: id.cls, boardId: id.board, name: 'Class 9', createdBy: id.system });
    await db.getRepository(Subject).insert({
      id: id.subject,
      boardId: id.board,
      classId: id.cls,
      name: 'Physics',
      language: 'en',
    });
    await db
      .getRepository(Chapter)
      .insert({ id: id.chapter, subjectId: id.subject, chapterNumber: 1, name: 'Motion' });
    await db.getRepository(Topic).insert([
      { id: id.topic, chapterId: id.chapter, name: 'Newton laws', order: 1 },
      {
        id: id.archivedTopic,
        chapterId: id.chapter,
        name: 'Archived motion',
        order: 2,
        status: CurriculumStatus.ARCHIVED,
      },
    ]);
    await db.getRepository(KnowledgeDocument).insert([
      {
        id: id.docA,
        tenantScope: TenantScope.SCHOOL,
        schoolId: id.schoolA,
        title: 'School A source',
        sourceType: KnowledgeSourceType.TXT,
        language: 'en',
        rightsMetadata: { permissionConfirmed: true, sourceOwner: 'test' },
        status: KnowledgeDocumentStatus.READY_FOR_MAPPING,
        createdBy: id.adminA,
      },
      {
        id: id.docB,
        tenantScope: TenantScope.SCHOOL,
        schoolId: id.schoolB,
        title: 'School B source',
        sourceType: KnowledgeSourceType.TXT,
        language: 'en',
        rightsMetadata: { permissionConfirmed: true, sourceOwner: 'test' },
        status: KnowledgeDocumentStatus.READY_FOR_MAPPING,
        createdBy: id.adminB,
      },
    ]);
    for (const [version, document] of [
      [id.versionA, id.docA],
      [id.versionB, id.docB],
    ]) {
      await db.getRepository(DocumentVersion).insert({
        id: version,
        documentId: document,
        versionNo: 1,
        storageKey: `test/${version}`,
        checksum: 'a'.repeat(64),
        mimeType: 'text/plain',
        validatedMimeType: 'text/plain',
        originalFilename: 'test.txt',
        fileSize: 20,
        extractionStatus: ExtractionStatus.COMPLETED,
        malwareScanStatus: MalwareScanStatus.NOT_SCANNED,
      });
      await db.getRepository(ContentChunk).insert({
        documentVersionId: version,
        tenantScope: TenantScope.SCHOOL,
        schoolId: document === id.docA ? id.schoolA : id.schoolB,
        content: 'Mapped processed test content',
        contentHash: 'b'.repeat(64),
        estimatedTokenCount: 6,
        locatorMetadata: { type: 'TEXT_LINES', lineFrom: 1, lineTo: 1 },
        chunkOrder: 1,
      });
    }
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])`, [
        [id.system, id.adminA, id.adminB, id.teacher],
      ]);
      await db.getRepository(DocumentTopicMapping).delete({ documentVersionId: id.versionA });
      await db
        .getRepository(ContentChunk)
        .delete([{ documentVersionId: id.versionA }, { documentVersionId: id.versionB }]);
      await db.getRepository(DocumentVersion).delete([id.versionA, id.versionB]);
      await db.getRepository(KnowledgeDocument).delete([id.docA, id.docB]);
      await db.getRepository(Topic).delete([id.topic, id.archivedTopic]);
      await db.getRepository(Chapter).delete(id.chapter);
      await db.getRepository(Subject).delete(id.subject);
      await db.getRepository(CurriculumClass).delete(id.cls);
      await db.getRepository(Board).delete(id.board);
      await db.getRepository(User).delete([id.system, id.adminA, id.adminB, id.teacher]);
      await db.getRepository(School).delete([id.schoolA, id.schoolB]);
    }
    await app?.close();
  });
  it('enforces tenant and role boundaries', async () => {
    await as(
      api().get(`/api/v1/kb/document-versions/${id.versionB}/mappings`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(403);
    await as(
      api()
        .post(`/api/v1/kb/document-versions/${id.versionA}/mappings`)
        .send({ boardId: id.board }),
      id.teacher,
      UserRole.TEACHER,
      id.schoolA,
    ).expect(403);
  });
  it('creates, validates, approves, reaches review, blocks publication, covers, and archives', async () => {
    const path = {
      boardId: id.board,
      classId: id.cls,
      subjectId: id.subject,
      chapterId: id.chapter,
      topicId: id.topic,
    };
    const made = await as(
      api().post(`/api/v1/kb/document-versions/${id.versionA}/mappings`).send(path),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(201);
    const mapping = made.body.data.id;
    expect(made.body.data.specificity).toBe(5);
    await as(
      api().post(`/api/v1/kb/document-versions/${id.versionA}/mappings`).send(path),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(409);
    await as(
      api()
        .post(`/api/v1/kb/document-versions/${id.versionA}/mappings`)
        .send({ ...path, topicId: randomUUID() }),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(400);
    await as(
      api()
        .post(`/api/v1/kb/document-versions/${id.versionA}/mappings`)
        .send({ ...path, topicId: id.archivedTopic }),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(400);
    await as(
      api().post(`/api/v1/kb/mappings/${mapping}/submit-review`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(201);
    const approved = await as(
      api().post(`/api/v1/kb/mappings/${mapping}/approve`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(201);
    expect(approved.body.data.approvedBy).toBe(id.adminA);
    const ready = await as(
      api().get(`/api/v1/kb/document-versions/${id.versionA}/readiness`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(200);
    expect(ready.body.data).toMatchObject({ reviewReady: true, publicationReady: false });
    expect(ready.body.data.publicationBlockers).toEqual(
      expect.arrayContaining(['MALWARE_NOT_SCANNED', 'EMBEDDINGS_MISSING']),
    );
    await as(
      api().post(`/api/v1/kb/document-versions/${id.versionA}/publish`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(409);
    const coverage = await as(
      api().get('/api/v1/kb/coverage').query(path),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(200);
    expect(coverage.body.data.coverage).toMatchObject({
      hasMappedContent: true,
      approvedMappings: 1,
      publicationReadyVersions: 0,
    });
    await as(
      api().delete(`/api/v1/kb/mappings/${mapping}`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(204);
    const after = await as(
      api().get(`/api/v1/kb/document-versions/${id.versionA}/readiness`),
      id.adminA,
      UserRole.SCHOOL_ADMIN,
      id.schoolA,
    ).expect(200);
    expect(after.body.data.reviewReady).toBe(false);
  });
});
