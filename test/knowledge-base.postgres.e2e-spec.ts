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
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip = require('jszip'); // eslint-disable-line @typescript-eslint/no-require-imports
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
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
import { IngestionModule } from '../src/modules/ingestion/ingestion.module';
import { KnowledgeBaseModule } from '../src/modules/knowledge-base/knowledge-base.module';
import { School } from '../src/modules/schools/school.entity';
import { User } from '../src/modules/users/user.entity';
import { MALWARE_SCANNER_PROVIDER } from '../src/infrastructure/file-security/malware-scanner.provider';

const controlledScanner = {
  scan: jest.fn(() =>
    Promise.resolve({ status: 'NOT_CONFIGURED' as const, provider: null, scannedAt: null }),
  ),
};

class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<{ user?: unknown }>().user)
      throw new UnauthorizedException();
    return true;
  }
}
const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
describeDatabase('Knowledge Base API with local PostgreSQL and storage', () => {
  let app: INestApplication;
  let data: DataSource;
  const ids: {
    system: string;
    adminA: string;
    adminB: string;
    teacher: string;
    schoolA: string;
    schoolB: string;
  } & Record<string, string> = {
    system: randomUUID(),
    adminA: randomUUID(),
    adminB: randomUUID(),
    teacher: randomUUID(),
    schoolA: randomUUID(),
    schoolB: randomUUID(),
  };
  const api = () => request(app.getHttpServer());
  const as = (
    call: request.Test,
    id: string,
    role: UserRole,
    schoolId: string | null = null,
    verified = true,
  ) =>
    call
      .set('x-test-user', id)
      .set('x-test-role', role)
      .set('x-test-school', schoolId ?? '')
      .set('x-test-verified', String(verified));
  beforeAll(async () => {
    process.env.KB_ALLOW_UNSCANNED_PROCESSING = 'true';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        KnowledgeBaseModule,
        IngestionModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: VerifiedEmailGuard },
      ],
    })
      .overrideProvider(MALWARE_SCANNER_PROVIDER)
      .useValue(controlledScanner)
      .compile();
    app = module.createNestApplication();
    app.use(
      (
        req: { user?: unknown; headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        if (req.headers['x-test-user'])
          req.user = {
            id: req.headers['x-test-user'],
            email: 'kb@example.invalid',
            role: req.headers['x-test-role'],
            schoolId: req.headers['x-test-school'] || null,
            emailVerified: req.headers['x-test-verified'] !== 'false',
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
    data = app.get(DataSource);
    await data.getRepository(School).insert([
      { id: ids.schoolA, name: `KB A ${ids.schoolA}` },
      { id: ids.schoolB, name: `KB B ${ids.schoolB}` },
    ]);
    const passwordHash = await hash(randomUUID());
    await data.getRepository(User).insert([
      {
        id: ids.system,
        name: 'system',
        email: `${ids.system}@example.invalid`,
        passwordHash,
        role: UserRole.SYSTEM_ADMIN,
        emailVerified: true,
        schoolId: null,
      },
      {
        id: ids.adminA,
        name: 'admin-a',
        email: `${ids.adminA}@example.invalid`,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        emailVerified: true,
        schoolId: ids.schoolA,
      },
      {
        id: ids.adminB,
        name: 'admin-b',
        email: `${ids.adminB}@example.invalid`,
        passwordHash,
        role: UserRole.SCHOOL_ADMIN,
        emailVerified: true,
        schoolId: ids.schoolB,
      },
      {
        id: ids.teacher,
        name: 'teacher',
        email: `${ids.teacher}@example.invalid`,
        passwordHash,
        role: UserRole.TEACHER,
        emailVerified: true,
        schoolId: ids.schoolA,
      },
    ]);
  });
  afterAll(async () => {
    if (data?.isInitialized) {
      const rows = await data.query(
        `SELECT storage_key FROM document_versions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE created_by=ANY($1::uuid[]))`,
        [[ids.system, ids.adminA, ids.adminB]],
      );
      for (const row of rows as Array<{ storage_key: string }>) {
        await rm(resolve(process.env.STORAGE_LOCAL_ROOT ?? './storage', row.storage_key), {
          force: true,
        });
      }
      await data.query(`DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])`, [
        [ids.system, ids.adminA, ids.adminB, ids.teacher],
      ]);
      await data.query(
        `DELETE FROM ingestion_jobs WHERE document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE created_by=ANY($1::uuid[])))`,
        [[ids.system, ids.adminA, ids.adminB]],
      );
      await data.query(
        `DELETE FROM content_chunks WHERE document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE created_by=ANY($1::uuid[])))`,
        [[ids.system, ids.adminA, ids.adminB]],
      );
      await data.query(
        `DELETE FROM document_versions WHERE document_id IN (SELECT id FROM knowledge_documents WHERE created_by=ANY($1::uuid[]))`,
        [[ids.system, ids.adminA, ids.adminB]],
      );
      await data.query(`DELETE FROM knowledge_documents WHERE created_by=ANY($1::uuid[])`, [
        [ids.system, ids.adminA, ids.adminB],
      ]);
      await data.getRepository(User).delete([ids.system, ids.adminA, ids.adminB, ids.teacher]);
      await data.getRepository(School).delete([ids.schoolA, ids.schoolB]);
    }
    await app?.close();
  });
  const rights = {
    permissionConfirmed: true,
    sourceOwner: 'Synthetic test owner',
    notes: 'Generated test fixture',
  };
  it('enforces authentication, verification, roles, scope, and rights', async () => {
    await api().get('/api/v1/kb/documents').expect(401);
    await as(
      api().get('/api/v1/kb/documents'),
      ids.teacher,
      UserRole.TEACHER,
      ids.schoolA,
      false,
    ).expect(403);
    await as(
      api()
        .post('/api/v1/kb/documents')
        .send({
          title: 'No rights',
          tenantScope: 'SCHOOL',
          sourceType: 'TXT',
          language: 'en',
          rights: { permissionConfirmed: false, sourceOwner: 'x' },
        }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(400);
    await as(
      api().post('/api/v1/kb/documents').send({
        title: 'Invalid global',
        tenantScope: 'GLOBAL',
        sourceType: 'TXT',
        language: 'en',
        rights,
      }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(403);
    const global = await as(
      api().post('/api/v1/kb/documents').send({
        title: 'Global synthetic PDF',
        tenantScope: 'GLOBAL',
        sourceType: 'PDF',
        language: 'en',
        rights,
      }),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(201);
    ids.global = global.body.data.id;
    const docx = await as(
      api().post('/api/v1/kb/documents').send({
        title: 'School A synthetic DOCX',
        tenantScope: 'SCHOOL',
        sourceType: 'DOCX',
        language: 'en',
        rights,
      }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    ids.docx = docx.body.data.id;
    const school = await as(
      api().post('/api/v1/kb/documents').send({
        title: 'School A notes',
        tenantScope: 'SCHOOL',
        sourceType: 'TXT',
        language: 'en',
        rights,
      }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    ids.document = school.body.data.id;
    expect(school.body.data.schoolId).toBe(ids.schoolA);
    await as(
      api().get(`/api/v1/kb/documents/${ids.document}`),
      ids.adminB,
      UserRole.SCHOOL_ADMIN,
      ids.schoolB,
    ).expect(403);
  });
  it('quarantines, checksums, versions, creates job, and rejects spoof/duplicate/teacher upload', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const text of [
      'Synthetic first page curriculum content with enough embedded text.',
      'Synthetic second page curriculum content with enough embedded text.',
    ]) {
      pdf.addPage().drawText(text, { font, size: 12 });
    }
    const pdfUpload = await as(
      api()
        .post(`/api/v1/kb/documents/${ids.global}/versions`)
        .attach('file', Buffer.from(await pdf.save()), {
          filename: 'fixture.pdf',
          contentType: 'application/pdf',
        }),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(201);
    ids.pdfVersion = pdfUpload.body.data.version.id;
    ids.pdfJob = pdfUpload.body.data.ingestionJob.id;
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    );
    zip
      .folder('_rels')!
      .file(
        '.rels',
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      );
    zip
      .folder('word')!
      .file(
        'document.xml',
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Motion</w:t></w:r></w:p><w:p><w:r><w:t>Velocity has magnitude and direction in this synthetic fixture.</w:t></w:r></w:p></w:body></w:document>`,
      )
      .file(
        'styles.xml',
        `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
      );
    const syntheticDocx = await zip.generateAsync({ type: 'nodebuffer' });
    const docxUpload = await as(
      api().post(`/api/v1/kb/documents/${ids.docx}/versions`).attach('file', syntheticDocx, {
        filename: 'fixture.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    ids.docxVersion = docxUpload.body.data.version.id;
    ids.docxJob = docxUpload.body.data.ingestionJob.id;
    await as(
      api()
        .post(`/api/v1/kb/documents/${ids.document}/versions`)
        .attach('file', Buffer.from('teacher'), { filename: 'x.txt', contentType: 'text/plain' }),
      ids.teacher,
      UserRole.TEACHER,
      ids.schoolA,
    ).expect(403);
    await as(
      api()
        .post(`/api/v1/kb/documents/${ids.document}/versions`)
        .attach('file', Buffer.from('MZ executable'), {
          filename: 'spoof.txt',
          contentType: 'text/plain',
        }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(400);
    const bytes = Buffer.from('Synthetic curriculum notes version one.');
    const upload = await as(
      api()
        .post(`/api/v1/kb/documents/${ids.document}/versions`)
        .attach('file', bytes, { filename: '../../notes.txt', contentType: 'text/plain' }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    ids.version = upload.body.data.version.id;
    ids.job = upload.body.data.ingestionJob.id;
    expect(upload.body.data.version).toMatchObject({
      versionNo: 1,
      extractionStatus: 'PENDING',
      malwareScanStatus: 'NOT_SCANNED',
      originalFilename: 'notes.txt',
    });
    expect(upload.body.data.version).not.toHaveProperty('storageKey');
    expect(upload.body.data.ingestionJob).toMatchObject({
      status: 'QUEUED',
      currentStep: 'SIGNATURE_VALIDATION',
    });
    await as(
      api()
        .post(`/api/v1/kb/documents/${ids.document}/versions`)
        .attach('file', bytes, { filename: 'again.txt', contentType: 'text/plain' }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(409);
    const second = await as(
      api()
        .post(`/api/v1/kb/documents/${ids.document}/versions`)
        .attach('file', Buffer.from('Synthetic curriculum notes version two.'), {
          filename: 'notes-v2.txt',
          contentType: 'text/plain',
        }),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    ids.secondVersion = second.body.data.version.id;
    ids.secondJob = second.body.data.ingestionJob.id;
    expect(second.body.data.version.versionNo).toBe(2);
  });
  it('lists safe metadata, enforces related-entity tenancy, and archives', async () => {
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.pdfJob}/process`),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(201);
    const pdfChunks = await as(
      api().get(`/api/v1/kb/document-versions/${ids.pdfVersion}/chunks`),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(200);
    expect(pdfChunks.body.data.items[0].locatorMetadata).toMatchObject({
      type: 'PDF_PAGE',
      pageFrom: 1,
    });
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.docxJob}/process`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    const docxChunks = await as(
      api().get(`/api/v1/kb/document-versions/${ids.docxVersion}/chunks`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(docxChunks.body.data.items[0].locatorMetadata).toMatchObject({
      type: 'DOCX_PARAGRAPH',
      paragraphFrom: 1,
    });
    const versions = await as(
      api().get(`/api/v1/kb/documents/${ids.document}/versions`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(versions.body.data.items).toHaveLength(2);
    await as(
      api().get(`/api/v1/kb/document-versions/${ids.version}`),
      ids.adminB,
      UserRole.SCHOOL_ADMIN,
      ids.schoolB,
    ).expect(403);
    await as(
      api().get(`/api/v1/kb/ingestion-jobs/${ids.job}`),
      ids.adminB,
      UserRole.SCHOOL_ADMIN,
      ids.schoolB,
    ).expect(403);
    const job = await as(
      api().get(`/api/v1/kb/ingestion-jobs/${ids.job}`),
      ids.teacher,
      UserRole.TEACHER,
      ids.schoolA,
    ).expect(200);
    expect(job.body.data.status).toBe('QUEUED');
    const processed = await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/process`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    expect(processed.body.data).toMatchObject({
      status: 'AWAITING_MAPPING',
      currentStep: 'READY_FOR_MAPPING',
    });
    const chunks = await as(
      api().get(`/api/v1/kb/document-versions/${ids.version}/chunks`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(chunks.body.data.items.length).toBeGreaterThan(0);
    expect(chunks.body.data.items[0].locatorMetadata).toMatchObject({
      type: 'TEXT_LINES',
      lineFrom: 1,
    });
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/scan`),
      ids.teacher,
      UserRole.TEACHER,
      ids.schoolA,
    ).expect(403);
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/scan`),
      ids.adminB,
      UserRole.SCHOOL_ADMIN,
      ids.schoolB,
    ).expect(403);
    controlledScanner.scan.mockResolvedValueOnce({
      status: 'CLEAN',
      provider: 'controlled_test',
      scannedAt: new Date(),
    } as never);
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/scan`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    const cleanVersion = await as(
      api().get(`/api/v1/kb/document-versions/${ids.version}`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(cleanVersion.body.data).toMatchObject({
      malwareScanStatus: 'CLEAN',
      malwareScannerProvider: 'controlled_test',
    });
    const cleanReadiness = await as(
      api().get(`/api/v1/kb/document-versions/${ids.version}/readiness`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(cleanReadiness.body.data.publicationBlockers).toContain('EMBEDDINGS_MISSING');
    expect(cleanReadiness.body.data.publicationBlockers).not.toContain('MALWARE_NOT_SCANNED');
    controlledScanner.scan.mockResolvedValueOnce({
      status: 'SCAN_FAILED',
      provider: 'controlled_test',
      scannedAt: new Date(),
      errorCode: 'CONTROLLED_FAILURE',
    } as never);
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.secondJob}/scan`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(201);
    const failedReadiness = await as(
      api().get(`/api/v1/kb/document-versions/${ids.secondVersion}/readiness`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(failedReadiness.body.data.publicationBlockers).toContain('MALWARE_SCAN_FAILED');
    controlledScanner.scan.mockResolvedValueOnce({
      status: 'INFECTED',
      provider: 'controlled_test',
      scannedAt: new Date(),
      threatName: 'Controlled.Test',
    } as never);
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.pdfJob}/scan`),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(201);
    const infectedReadiness = await as(
      api().get(`/api/v1/kb/document-versions/${ids.pdfVersion}/readiness`),
      ids.system,
      UserRole.SYSTEM_ADMIN,
    ).expect(200);
    expect(infectedReadiness.body.data.publicationBlockers).toContain('MALWARE_DETECTED');
    const securityAudit = await data.query(
      `SELECT action FROM audit_logs WHERE actor_id=ANY($1::uuid[]) AND action LIKE 'kb.security.scan.%'`,
      [[ids.system, ids.adminA]],
    );
    expect(securityAudit.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining([
        'kb.security.scan.clean',
        'kb.security.scan.failed',
        'kb.security.scan.infected',
      ]),
    );
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/process`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(409);
    await as(
      api().post(`/api/v1/kb/ingestion-jobs/${ids.job}/retry`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(409);
    const list = await as(
      api().get('/api/v1/kb/documents?status=READY_FOR_MAPPING&search=School'),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(200);
    expect(list.body.data.items.map((x: { id: string }) => x.id)).toContain(ids.document);
    await as(
      api().delete(`/api/v1/kb/documents/${ids.document}`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(204);
    await as(
      api().get(`/api/v1/kb/documents/${ids.document}`),
      ids.adminA,
      UserRole.SCHOOL_ADMIN,
      ids.schoolA,
    ).expect(404);
  });
});
