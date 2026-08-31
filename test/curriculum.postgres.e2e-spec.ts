import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'crypto';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';
import dataSourceOptions from '../src/database/data-source';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/common/guards/verified-email.guard';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AuditModule } from '../src/modules/audit/audit.module';
import { CurriculumModule } from '../src/modules/curriculum/curriculum.module';
import { User } from '../src/modules/users/user.entity';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
describeDatabase('Curriculum API with local PostgreSQL', () => {
  let app: INestApplication;
  let data: DataSource;
  const actorId = randomUUID();
  const ids: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const asRole = (call: request.Test, role = UserRole.SYSTEM_ADMIN, verified = true) =>
    call.set('x-test-role', role).set('x-test-verified', String(verified));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        CurriculumModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: VerifiedEmailGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: { user?: unknown; headers: Record<string, string> },
        _res: unknown,
        next: () => void,
      ) => {
        req.user = {
          id: actorId,
          email: 'curriculum-test@example.invalid',
          role: req.headers['x-test-role'] ?? UserRole.SYSTEM_ADMIN,
          schoolId: null,
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
    await data.getRepository(User).insert({
      id: actorId,
      name: 'Curriculum Test Admin',
      email: `curriculum-${actorId}@example.invalid`,
      passwordHash: await hash(randomUUID()),
      role: UserRole.SYSTEM_ADMIN,
      emailVerified: true,
      schoolId: null,
    });
  });

  afterAll(async () => {
    if (data?.isInitialized) {
      for (const [table, key] of [
        ['topics', 'topic'],
        ['chapters', 'chapter'],
        ['subjects', 'subject'],
        ['sections', 'section'],
        ['classes', 'class2'],
        ['classes', 'class'],
        ['boards', 'board2'],
        ['boards', 'board'],
      ] as const)
        if (ids[key]) await data.query(`DELETE FROM ${table} WHERE id = $1`, [ids[key]]);
      await data.query('DELETE FROM audit_logs WHERE actor_id = $1', [actorId]);
      await data.getRepository(User).delete(actorId);
    }
    await app?.close();
  });

  it('enforces verified email and mutation RBAC', async () => {
    await asRole(api().get('/api/v1/boards'), UserRole.TEACHER, false).expect(403);
    await asRole(api().post('/api/v1/boards').send({ name: 'Denied' }), UserRole.TEACHER).expect(
      403,
    );
    await asRole(
      api().post('/api/v1/boards').send({ name: 'Denied' }),
      UserRole.SCHOOL_ADMIN,
    ).expect(403);
  });

  it('creates, rejects duplicates, paginates, updates and archives a board', async () => {
    const name = `Board ${actorId}`;
    const created = await asRole(api().post('/api/v1/boards').send({ name })).expect(201);
    ids.board = created.body.data.id;
    await asRole(api().post('/api/v1/boards').send({ name: name.toUpperCase() })).expect(409);
    const page = await asRole(api().get('/api/v1/boards?page=1&limit=1')).expect(200);
    expect(page.body.data.pagination).toMatchObject({ page: 1, limit: 1 });
    await asRole(
      api().patch(`/api/v1/boards/${ids.board}`).send({ description: 'Updated' }),
    ).expect(200);
  });

  it('validates the full hierarchy and ordering', async () => {
    const cls = await asRole(
      api().post('/api/v1/classes').send({ boardId: ids.board, name: 'Class 9' }),
    ).expect(201);
    ids.class = cls.body.data.id;
    const section = await asRole(
      api().post('/api/v1/sections').send({ classId: ids.class, name: 'A' }),
    ).expect(201);
    ids.section = section.body.data.id;
    const subject = await asRole(
      api()
        .post('/api/v1/subjects')
        .send({ boardId: ids.board, classId: ids.class, name: 'Physics' }),
    ).expect(201);
    ids.subject = subject.body.data.id;
    const chapter = await asRole(
      api()
        .post('/api/v1/chapters')
        .send({ subjectId: ids.subject, chapterNumber: 1, name: 'Motion' }),
    ).expect(201);
    ids.chapter = chapter.body.data.id;
    const topic = await asRole(
      api().post('/api/v1/topics').send({ chapterId: ids.chapter, name: 'Velocity', order: 2 }),
    ).expect(201);
    ids.topic = topic.body.data.id;
    await asRole(
      api().post('/api/v1/topics').send({ chapterId: ids.chapter, name: ' velocity ', order: 3 }),
    ).expect(409);
    await asRole(
      api().post('/api/v1/topics').send({ chapterId: ids.chapter, name: 'Bad', order: -1 }),
    ).expect(400);
    const list = await asRole(api().get(`/api/v1/topics?chapterId=${ids.chapter}`)).expect(200);
    expect(list.body.data.items[0].id).toBe(ids.topic);
  });

  it('rejects a Board/Class mismatch and archives instead of cascading deletion', async () => {
    const board2 = await asRole(
      api()
        .post('/api/v1/boards')
        .send({ name: `Other ${actorId}` }),
    ).expect(201);
    ids.board2 = board2.body.data.id;
    const class2 = await asRole(
      api().post('/api/v1/classes').send({ boardId: ids.board2, name: 'Class 10' }),
    ).expect(201);
    ids.class2 = class2.body.data.id;
    await asRole(
      api()
        .post('/api/v1/subjects')
        .send({ boardId: ids.board, classId: ids.class2, name: 'Invalid' }),
    ).expect(400);
    await asRole(api().delete(`/api/v1/boards/${ids.board}`)).expect(204);
    await asRole(api().get(`/api/v1/boards/${ids.board}`)).expect(404);
    expect(
      await data.query('SELECT count(*)::int count FROM classes WHERE id=$1', [ids.class]),
    ).toEqual([{ count: 1 }]);
  });
});
