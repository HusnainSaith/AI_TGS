import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'crypto';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { VerifiedEmailGuard } from '../src/common/guards/verified-email.guard';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { UserRole } from '../src/common/enums/user-role.enum';
import dataSourceOptions from '../src/database/data-source';
import { AuditModule } from '../src/modules/audit/audit.module';
import {
  Board,
  Chapter,
  CurriculumClass,
  Subject,
  Topic,
} from '../src/modules/curriculum/curriculum.entities';
import { CurriculumStatus } from '../src/modules/curriculum/curriculum-status.enum';
import { QuestionType } from '../src/modules/questions/enums/question.enums';
import { QuestionsModule } from '../src/modules/questions/questions.module';
import { User } from '../src/modules/users/user.entity';
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest<{ user?: unknown }>().user)
      throw new UnauthorizedException();
    return true;
  }
}
const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
describeDatabase('Manual Question Bank API with local PostgreSQL', () => {
  let app: INestApplication;
  let data: DataSource;
  const ids: { teacher1: string; teacher2: string; admin: string } & Record<string, string> = {
    teacher1: randomUUID(),
    teacher2: randomUUID(),
    admin: randomUUID(),
  };
  const api = () => request(app.getHttpServer());
  const as = (
    call: request.Test,
    userId = ids.teacher1,
    role = UserRole.TEACHER,
    verified = true,
  ) =>
    call
      .set('x-test-user', userId)
      .set('x-test-role', role)
      .set('x-test-verified', String(verified));
  let base: Record<string, unknown>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        QuestionsModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: TestAuthGuard },
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
        if (req.headers['x-test-user'])
          req.user = {
            id: req.headers['x-test-user'],
            email: 'test@example.invalid',
            role: req.headers['x-test-role'] ?? UserRole.TEACHER,
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
    const passwordHash = await hash(randomUUID());
    for (const [key, role] of [
      ['teacher1', UserRole.TEACHER],
      ['teacher2', UserRole.TEACHER],
      ['admin', UserRole.SYSTEM_ADMIN],
    ] as const)
      await data.getRepository(User).insert({
        id: ids[key],
        name: key,
        email: `${key}-${ids[key]}@example.invalid`,
        passwordHash,
        role,
        emailVerified: true,
        schoolId: null,
      });
    const suffix = ids.teacher1;
    const board = await data
      .getRepository(Board)
      .save({ name: `QB Board ${suffix}`, description: null, status: CurriculumStatus.ACTIVE });
    ids.board = board.id;
    const cls = await data.getRepository(CurriculumClass).save({
      name: 'QB Class',
      boardId: board.id,
      createdBy: ids.admin,
      status: CurriculumStatus.ACTIVE,
    });
    ids.class = cls.id;
    const subject = await data.getRepository(Subject).save({
      name: 'Physics',
      classId: cls.id,
      boardId: board.id,
      language: 'en',
      description: null,
      status: CurriculumStatus.ACTIVE,
    });
    ids.subject = subject.id;
    const other = await data.getRepository(Subject).save({
      name: 'Chemistry',
      classId: cls.id,
      boardId: board.id,
      language: 'en',
      description: null,
      status: CurriculumStatus.ACTIVE,
    });
    ids.otherSubject = other.id;
    const chapter = await data.getRepository(Chapter).save({
      subjectId: subject.id,
      chapterNumber: 1,
      name: 'Motion',
      description: null,
      status: CurriculumStatus.ACTIVE,
    });
    ids.chapter = chapter.id;
    const topic = await data.getRepository(Topic).save({
      chapterId: chapter.id,
      name: 'Velocity',
      description: null,
      order: 1,
      status: CurriculumStatus.ACTIVE,
    });
    ids.topic = topic.id;
    base = {
      topicId: ids.topic,
      chapterId: ids.chapter,
      subjectId: ids.subject,
      classId: ids.class,
      difficulty: 'MEDIUM',
      marks: 2,
    };
  });
  afterAll(async () => {
    if (data?.isInitialized) {
      await data.query('DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])', [
        Object.values(ids).filter((v) => /^[0-9a-f-]{36}$/i.test(v)),
      ]);
      await data.query(
        'DELETE FROM question_options WHERE question_id IN (SELECT id FROM questions WHERE created_by = ANY($1::uuid[]))',
        [[ids.teacher1, ids.teacher2, ids.admin]],
      );
      await data.query('DELETE FROM questions WHERE created_by = ANY($1::uuid[])', [
        [ids.teacher1, ids.teacher2, ids.admin],
      ]);
      for (const [table, key] of [
        ['topics', 'topic'],
        ['chapters', 'chapter'],
        ['subjects', 'otherSubject'],
        ['subjects', 'subject'],
        ['classes', 'class'],
        ['boards', 'board'],
      ] as const)
        if (ids[key]) await data.query(`DELETE FROM ${table} WHERE id=$1`, [ids[key]]);
      await data.getRepository(User).delete([ids.teacher1, ids.teacher2, ids.admin]);
    }
    await app?.close();
  });
  it('rejects unauthenticated and unverified callers', async () => {
    await api().get('/api/v1/questions').expect(401);
    await as(api().get('/api/v1/questions'), ids.teacher1, UserRole.TEACHER, false).expect(403);
  });
  it('creates a valid server-stamped MCQ and rejects malformed MCQs', async () => {
    const options = [1, 2, 3, 4].map((n) => ({
      optionText: `Choice ${n}`,
      optionOrder: n,
      isCorrect: n === 1,
    }));
    const created = await as(
      api()
        .post('/api/v1/questions')
        .send({ ...base, type: 'MCQ', questionText: 'What is velocity?', options }),
    ).expect(201);
    ids.mcq = created.body.data.id;
    expect(created.body.data).toMatchObject({
      source: 'MANUAL',
      reviewStatus: 'APPROVED',
      groundingStatus: 'NOT_APPLICABLE',
      status: 'ACTIVE',
    });
    expect(created.body.data.options).toHaveLength(4);
    await as(
      api()
        .post('/api/v1/questions')
        .send({ ...base, type: 'MCQ', questionText: 'Invalid MCQ', options: options.slice(0, 3) }),
    ).expect(400);
    await as(
      api()
        .post('/api/v1/questions')
        .send({
          ...base,
          type: 'MCQ',
          questionText: 'No correct',
          options: options.map((o) => ({ ...o, isCorrect: false })),
        }),
    ).expect(400);
    await as(
      api()
        .post('/api/v1/questions')
        .send({
          ...base,
          type: 'MCQ',
          questionText: 'Duplicate options',
          options: options.map((o, i) => ({
            ...o,
            optionText: i === 3 ? ' choice 1 ' : o.optionText,
          })),
        }),
    ).expect(400);
  });
  it('creates SHORT, LONG, TRUE_FALSE and FILL_BLANK with their type rules', async () => {
    for (const type of [QuestionType.SHORT, QuestionType.LONG, QuestionType.FILL_BLANK]) {
      const response = await as(
        api()
          .post('/api/v1/questions')
          .send({
            ...base,
            type,
            questionText: `${type} ${ids.teacher1}`,
            explanation: 'Model answer',
          }),
      ).expect(201);
      ids[type] = response.body.data.id;
    }
    const tf = await as(
      api()
        .post('/api/v1/questions')
        .send({
          ...base,
          type: 'TRUE_FALSE',
          questionText: `TF ${ids.teacher1}`,
          options: [
            { optionText: 'TRUE', optionOrder: 1, isCorrect: false },
            { optionText: 'FALSE', optionOrder: 2, isCorrect: true },
          ],
        }),
    ).expect(201);
    ids.TRUE_FALSE = tf.body.data.id;
    await as(
      api()
        .post('/api/v1/questions')
        .send({
          ...base,
          type: 'SHORT',
          questionText: 'Short with options',
          options: [{ optionText: 'No', optionOrder: 1, isCorrect: true }],
        }),
    ).expect(400);
  });
  it('enforces hierarchy, duplicate and ownership boundaries', async () => {
    await as(
      api()
        .post('/api/v1/questions')
        .send({ ...base, subjectId: ids.otherSubject, type: 'SHORT', questionText: 'Wrong path' }),
    ).expect(400);
    await as(
      api()
        .post('/api/v1/questions')
        .send({
          ...base,
          type: 'MCQ',
          questionText: '  what   is velocity? ',
          options: [1, 2, 3, 4].map((n) => ({
            optionText: `Other ${n}`,
            optionOrder: n,
            isCorrect: n === 1,
          })),
        }),
    ).expect(409);
    await as(api().get(`/api/v1/questions/${ids.mcq}`), ids.teacher2).expect(403);
    await as(api().patch(`/api/v1/questions/${ids.mcq}`).send({ marks: 3 }), ids.teacher2).expect(
      403,
    );
    await as(api().delete(`/api/v1/questions/${ids.mcq}`), ids.teacher2).expect(403);
    await as(api().get(`/api/v1/questions/${ids.mcq}`), ids.teacher2, UserRole.SCHOOL_ADMIN).expect(
      403,
    );
    await as(api().get(`/api/v1/questions/${ids.mcq}`), ids.admin, UserRole.SYSTEM_ADMIN).expect(
      200,
    );
  });
  it('filters, updates types atomically, approves idempotently, and archives', async () => {
    const list = await as(
      api().get(`/api/v1/questions?topicId=${ids.topic}&type=MCQ&page=1&limit=10`),
    ).expect(200);
    expect(list.body.data.items.map((q: { id: string }) => q.id)).toContain(ids.mcq);
    const updated = await as(
      api()
        .patch(`/api/v1/questions/${ids.mcq}`)
        .send({ type: 'SHORT', questionText: 'Updated velocity question' }),
    ).expect(200);
    expect(updated.body.data.options).toHaveLength(0);
    expect(updated.body.data.type).toBe('SHORT');
    await as(api().post(`/api/v1/questions/${ids.mcq}/approve`)).expect(201);
    await as(api().post(`/api/v1/questions/${ids.mcq}/approve`)).expect(201);
    await as(api().delete(`/api/v1/questions/${ids.mcq}`)).expect(204);
    await as(api().get(`/api/v1/questions/${ids.mcq}`)).expect(404);
    const active = await as(api().get('/api/v1/questions?search=Updated%20velocity')).expect(200);
    expect(active.body.data.items).toHaveLength(0);
    const archived = await as(api().get('/api/v1/questions?status=ARCHIVED')).expect(200);
    expect(archived.body.data.items.map((q: { id: string }) => q.id)).toContain(ids.mcq);
  });
});
