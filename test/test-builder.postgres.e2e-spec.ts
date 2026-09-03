import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, In } from 'typeorm';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../src/infrastructure/storage/object-storage.provider';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
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
import { Question } from '../src/modules/questions/entities/question.entity';
import { QuestionOption } from '../src/modules/questions/entities/question-option.entity';
import {
  GroundingStatus,
  QuestionDifficulty,
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from '../src/modules/questions/enums/question.enums';
import { Plan } from '../src/modules/subscriptions/entities/plan.entity';
import { Subscription } from '../src/modules/subscriptions/entities/subscription.entity';
import {
  BillingInterval,
  SubscriptionStatus,
} from '../src/modules/subscriptions/subscription.enums';
import { SubscriptionsModule } from '../src/modules/subscriptions/subscriptions.module';
import { TestExportType } from '../src/modules/test-exports/test-export.enums';
import { TestExportsModule } from '../src/modules/test-exports/test-exports.module';
import { TestExportsService } from '../src/modules/test-exports/test-exports.service';
import { TestsModule } from '../src/modules/tests/tests.module';
import { TestsService } from '../src/modules/tests/tests.service';
import { TestSectionsService } from '../src/modules/tests/test-sections.service';
import { User } from '../src/modules/users/user.entity';
const run = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
run('Persisted Test Builder with PostgreSQL (e2e)', () => {
  let app: INestApplication,
    db: DataSource,
    tests: TestsService,
    sections: TestSectionsService,
    exports: TestExportsService,
    storage: ObjectStorageProvider;
  const id = {
    teacher: randomUUID(),
    other: randomUUID(),
    board: randomUUID(),
    cls: randomUUID(),
    subject: randomUUID(),
    chapter: randomUUID(),
    topic: randomUUID(),
    q1: randomUUID(),
    q2: randomUUID(),
    plan: randomUUID(),
    subscription: randomUUID(),
  };
  const teacher: AuthenticatedUser = {
      id: id.teacher,
      email: `${id.teacher}@test.invalid`,
      role: UserRole.TEACHER,
      schoolId: null,
      emailVerified: true,
    },
    other: AuthenticatedUser = { ...teacher, id: id.other, email: `${id.other}@test.invalid` };
  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        SubscriptionsModule,
        TestsModule,
        TestExportsModule,
      ],
    }).compile();
    app = ref.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    tests = app.get(TestsService);
    sections = app.get(TestSectionsService);
    exports = app.get(TestExportsService);
    storage = app.get(OBJECT_STORAGE_PROVIDER);
    const passwordHash = await hash(randomUUID());
    await db.getRepository(User).insert([
      { ...teacher, name: 'test builder teacher', passwordHash },
      { ...other, name: 'other', passwordHash },
    ]);
    await db.getRepository(Board).insert({ id: id.board, name: `Test Board ${id.board}` });
    await db
      .getRepository(CurriculumClass)
      .insert({ id: id.cls, boardId: id.board, name: 'Class 10', createdBy: id.teacher });
    await db.getRepository(Subject).insert({
      id: id.subject,
      classId: id.cls,
      boardId: id.board,
      name: 'Science',
      language: 'en',
    });
    await db
      .getRepository(Chapter)
      .insert({ id: id.chapter, subjectId: id.subject, chapterNumber: 1, name: 'Matter' });
    await db
      .getRepository(Topic)
      .insert({ id: id.topic, chapterId: id.chapter, name: 'Atoms', order: 1 });
    for (const [qid, text] of [
      [id.q1, 'Original immutable question?'],
      [id.q2, 'Concurrency question?'],
    ]) {
      await db.getRepository(Question).insert({
        id: qid,
        topicId: id.topic,
        chapterId: id.chapter,
        subjectId: id.subject,
        classId: id.cls,
        type: QuestionType.MCQ,
        questionText: text,
        difficulty: QuestionDifficulty.EASY,
        marks: 2,
        explanation: 'Option B',
        source: QuestionSource.MANUAL,
        reviewStatus: QuestionReviewStatus.APPROVED,
        generationJobId: null,
        generationJobItemId: null,
        createdBy: id.teacher,
        status: QuestionStatus.ACTIVE,
        groundingStatus: GroundingStatus.NOT_APPLICABLE,
        retrievalEventId: null,
      });
      await db.getRepository(QuestionOption).insert(
        [1, 2, 3, 4].map((n) => ({
          questionId: qid,
          optionText: `Option ${n}`,
          optionOrder: n,
          isCorrect: n === 2,
        })),
      );
    }
    await db.getRepository(Plan).insert({
      id: id.plan,
      name: 'Test Builder Limit',
      code: `TEST_BUILDER_${id.plan.replaceAll('-', '')}`,
      price: '0.00',
      currency: 'USD',
      billingInterval: BillingInterval.MONTHLY,
      isActive: true,
      isDefault: false,
      limits: { aiQuestionsPerPeriod: null, testsPerPeriod: 2, pdfExportsPerPeriod: 2 },
      features: {},
    });
    await db.getRepository(Subscription).insert({
      id: id.subscription,
      userId: id.teacher,
      schoolId: null,
      planId: id.plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(Date.now() - 60000),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      metadata: null,
    });
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])`, [
        [id.teacher, id.other],
      ]);
      const artifacts = await db.query(
        `SELECT storage_key FROM test_exports WHERE requested_by=$1 AND storage_key IS NOT NULL`,
        [id.teacher],
      );
      for (const artifact of artifacts) await storage.deleteObject(artifact.storage_key);
      await db.query(`DELETE FROM test_exports WHERE requested_by=$1`, [id.teacher]);
      await db.query(`DELETE FROM usage_ledger WHERE subscription_id=$1`, [id.subscription]);
      await db.query(`DELETE FROM usage_reservations WHERE subscription_id=$1`, [id.subscription]);
      await db.query(`DELETE FROM usage_counters WHERE subscription_id=$1`, [id.subscription]);
      await db.query(
        `DELETE FROM test_questions WHERE test_id IN (SELECT id FROM tests WHERE created_by=$1)`,
        [id.teacher],
      );
      await db.query(
        `DELETE FROM test_sections WHERE test_id IN (SELECT id FROM tests WHERE created_by=$1)`,
        [id.teacher],
      );
      await db.query(`DELETE FROM tests WHERE created_by=$1`, [id.teacher]);
      await db.getRepository(QuestionOption).delete({ questionId: In([id.q1, id.q2]) });
      await db.getRepository(Question).delete([id.q1, id.q2]);
      await db.getRepository(Subscription).delete(id.subscription);
      await db.getRepository(Plan).delete(id.plan);
      await db.getRepository(Topic).delete(id.topic);
      await db.getRepository(Chapter).delete(id.chapter);
      await db.getRepository(Subject).delete(id.subject);
      await db.getRepository(CurriculumClass).delete(id.cls);
      await db.getRepository(Board).delete(id.board);
      await db.getRepository(User).delete([id.teacher, id.other]);
    }
    await app?.close();
  });
  it('freezes answer snapshots, enforces ownership and consumes finalization quota once', async () => {
    const draft = await tests.create(
      { title: '../../Immutable Test', classId: id.cls, subjectId: id.subject, language: 'en' },
      teacher,
    );
    expect(draft.status).toBe('DRAFT');
    await tests.add(draft.id, { questionId: id.q1 }, teacher);
    const section = await sections.create(
      draft.id,
      { title: 'Section A', instructions: 'Attempt every question.' },
      teacher,
    );
    const current = await tests.get(draft.id, teacher);
    await sections.assign(
      draft.id,
      current.questions[0]!.id,
      { testSectionId: section.id },
      teacher,
    );
    await expect(tests.get(draft.id, other)).rejects.toThrow('permission');
    const before = await tests.preview(draft.id, teacher);
    expect(before.sections[1]).toMatchObject({
      title: 'Section A',
      instructions: 'Attempt every question.',
      marks: 2,
    });
    expect(before.questions[0]!.options![1]).not.toHaveProperty('isCorrect');
    const final = await tests.finalize(draft.id, teacher);
    expect(final).toMatchObject({ status: 'FINALIZED', totalQuestions: 1, totalMarks: 2 });
    await tests.finalize(draft.id, teacher);
    await expect(
      sections.update(draft.id, section.id, { title: 'Changed' }, teacher),
    ).rejects.toThrow('DRAFT');
    const clone = await tests.clone(draft.id, teacher);
    expect(clone.sections.map((value: { title: string }) => value.title)).toEqual([
      'Questions',
      'Section A',
    ]);
    await db
      .getRepository(QuestionOption)
      .update({ questionId: id.q1, optionOrder: 2 }, { isCorrect: false });
    await db
      .getRepository(QuestionOption)
      .update({ questionId: id.q1, optionOrder: 3 }, { isCorrect: true });
    const key = await tests.answerKey(draft.id, teacher);
    expect(key.questions[0]!.answer).toEqual({ correctOptionOrders: [2] });
    const paper = await exports.create(
      draft.id,
      { type: TestExportType.QUESTION_PAPER },
      teacher,
      'paper-retry-key',
    );
    expect(paper).toMatchObject({ status: 'COMPLETED', mimeType: 'application/pdf' });
    expect(paper.filename).toBe('immutable-test-question-paper.pdf');
    const paperRetry = await exports.create(
      draft.id,
      { type: TestExportType.QUESTION_PAPER },
      teacher,
      'paper-retry-key',
    );
    expect(paperRetry.id).toBe(paper.id);
    const answer = await exports.create(draft.id, { type: TestExportType.ANSWER_KEY }, teacher);
    const downloaded = await exports.download(draft.id, paper.id, teacher);
    expect(downloaded.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(createHash('sha256').update(downloaded.buffer).digest('hex')).toBe(paper.sha256);
    await exports.download(draft.id, paper.id, teacher);
    await expect(exports.get(draft.id, answer.id, other)).rejects.toThrow('ACCESS_DENIED');
    const [pdfCounter] = await db.query(
      `SELECT used::int FROM usage_counters WHERE subscription_id=$1 AND metric='PDF_EXPORTS'`,
      [id.subscription],
    );
    expect(pdfCounter.used).toBe(2);
    await expect(tests.add(draft.id, { questionId: id.q2 }, teacher)).rejects.toThrow('DRAFT');
    const [counter] = await db.query(
      `SELECT used::int FROM usage_counters WHERE subscription_id=$1 AND metric='TESTS'`,
      [id.subscription],
    );
    expect(counter.used).toBe(1);
  });
  it('allows concurrent drafts but never exceeds a finite TESTS quota', async () => {
    const a = await tests.create(
        { title: 'Race A', classId: id.cls, subjectId: id.subject, language: 'en' },
        teacher,
      ),
      b = await tests.create(
        { title: 'Race B', classId: id.cls, subjectId: id.subject, language: 'en' },
        teacher,
      );
    await tests.add(a.id, { questionId: id.q2 }, teacher);
    await tests.add(b.id, { questionId: id.q2 }, teacher);
    const outcomes = await Promise.allSettled([
      tests.finalize(a.id, teacher),
      tests.finalize(b.id, teacher),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const [counter] = await db.query(
      `SELECT used::int FROM usage_counters WHERE subscription_id=$1 AND metric='TESTS'`,
      [id.subscription],
    );
    expect(counter.used).toBe(2);
  });
  it('serializes finalization against question mutation without metadata drift', async () => {
    await db.query(`UPDATE plans SET limits=jsonb_set(limits,'{testsPerPeriod}','3') WHERE id=$1`, [
      id.plan,
    ]);
    const draft = await tests.create(
      { title: 'Mutation Race', classId: id.cls, subjectId: id.subject, language: 'en' },
      teacher,
    );
    await tests.add(draft.id, { questionId: id.q1 }, teacher);
    await Promise.allSettled([
      tests.finalize(draft.id, teacher),
      tests.add(draft.id, { questionId: id.q2 }, teacher),
    ]);
    const [state] = await db.query(
      `SELECT t.status,t.total_questions::int,(SELECT count(*)::int FROM test_questions q WHERE q.test_id=t.id) actual FROM tests t WHERE t.id=$1`,
      [draft.id],
    );
    expect(state.status).toBe('FINALIZED');
    expect(state.total_questions).toBe(state.actual);
    await db.query(
      `UPDATE plans SET limits=jsonb_set(limits,'{pdfExportsPerPeriod}','3') WHERE id=$1`,
      [id.plan],
    );
    const exportRace = await Promise.allSettled([
      exports.create(draft.id, { type: TestExportType.QUESTION_PAPER }, teacher),
      exports.create(draft.id, { type: TestExportType.QUESTION_PAPER }, teacher),
    ]);
    expect(exportRace.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(exportRace.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [pdfCounter] = await db.query(
      `SELECT used::int,reserved::int FROM usage_counters WHERE subscription_id=$1 AND metric='PDF_EXPORTS'`,
      [id.subscription],
    );
    expect(pdfCounter).toEqual({ used: 3, reserved: 0 });
  });
});
