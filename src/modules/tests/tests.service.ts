import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CurriculumClass, Section, Subject } from '../curriculum/curriculum.entities';
import { Question } from '../questions/entities/question.entity';
import {
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
} from '../questions/enums/question.enums';
import { EntitlementService } from '../subscriptions/entitlement.service';
import { UsageMetric } from '../subscriptions/subscription.enums';
import { UsageService } from '../subscriptions/usage.service';
import {
  AddQuestionDto,
  BulkAddQuestionsDto,
  CreateTestDto,
  ListTestsDto,
  ReorderQuestionsDto,
  UpdateTestDto,
} from './dto/test.dto';
import { ExamTest } from './entities/test.entity';
import { TestQuestion } from './entities/test-question.entity';
import { TestSnapshotService } from './test-snapshot.service';
import { TestStatus } from './test.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.types';
@Injectable()
export class TestsService {
  constructor(
    private data: DataSource,
    @InjectRepository(ExamTest) private tests: Repository<ExamTest>,
    @InjectRepository(TestQuestion) private testQuestions: Repository<TestQuestion>,
    private snapshots: TestSnapshotService,
    private entitlement: EntitlementService,
    private usage: UsageService,
    private audit: AuditService,
    private notifications?: NotificationsService,
  ) {}
  async create(dto: CreateTestDto, user: AuthenticatedUser) {
    await this.validateScope(dto.classId, dto.sectionId ?? null, dto.subjectId);
    return this.data.transaction(async (m) => {
      const saved = await m.getRepository(ExamTest).save({
        ...dto,
        sectionId: dto.sectionId ?? null,
        description: dto.description?.trim() || null,
        instructions: dto.instructions?.trim() || null,
        durationMinutes: dto.durationMinutes ?? null,
        createdBy: user.id,
        schoolId: user.schoolId,
        status: TestStatus.DRAFT,
        totalMarks: 0,
        totalQuestions: 0,
        clonedFromTestId: null,
        finalizedAt: null,
        archivedAt: null,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.create',
          entityType: 'test',
          entityId: saved.id,
          metadata: { classId: saved.classId, subjectId: saved.subjectId },
        },
        m,
      );
      return this.read(saved.id, m);
    });
  }
  async list(q: ListTestsDto, user: AuthenticatedUser) {
    const qb = this.tests
      .createQueryBuilder('test')
      .where('test.status != :archived', { archived: TestStatus.ARCHIVED });
    this.scope(qb, user);
    for (const [k, v] of Object.entries({
      status: q.status,
      classId: q.classId,
      sectionId: q.sectionId,
      subjectId: q.subjectId,
    }))
      if (v !== undefined) qb.andWhere(`test.${k}=:${k}`, { [k]: v });
    if (q.search) qb.andWhere('test.title ILIKE :search', { search: `%${q.search}%` });
    const [items, total] = await qb
      .orderBy('test.createdAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items: items.map((t) => this.meta(t)),
      total,
      page: q.page,
      limit: q.limit,
      pages: Math.ceil(total / q.limit),
    };
  }
  async get(id: string, user: AuthenticatedUser) {
    const t = await this.scoped(id, user);
    const qs = await this.testQuestions.find({ where: { testId: id }, order: { position: 'ASC' } });
    return this.detail(t, qs, false);
  }
  async preview(id: string, user: AuthenticatedUser) {
    const t = await this.scoped(id, user);
    const qs = await this.testQuestions.find({ where: { testId: id }, order: { position: 'ASC' } });
    return this.detail(t, qs, true);
  }
  async answerKey(id: string, user: AuthenticatedUser) {
    const t = await this.scoped(id, user);
    const qs = await this.testQuestions.find({ where: { testId: id }, order: { position: 'ASC' } });
    await this.audit.record({
      actorId: user.id,
      action: 'test.answer_key.view',
      entityType: 'test',
      entityId: id,
    });
    return {
      id: t.id,
      title: t.title,
      questions: qs.map((q) => ({
        position: q.position,
        type: q.type,
        answer: q.answerSnapshot,
        marks: q.marksSnapshot,
        explanation: q.explanationSnapshot,
      })),
    };
  }
  async update(id: string, dto: UpdateTestDto, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      this.draft(t);
      if (dto.sectionId !== undefined)
        await this.validateScope(t.classId, dto.sectionId, t.subjectId, m);
      Object.assign(t, dto, {
        description: dto.description === undefined ? t.description : dto.description.trim() || null,
        instructions:
          dto.instructions === undefined ? t.instructions : dto.instructions.trim() || null,
      });
      await m.getRepository(ExamTest).save(t);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.update',
          entityType: 'test',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
        },
        m,
      );
      return this.read(id, m);
    });
  }
  add(id: string, dto: AddQuestionDto, user: AuthenticatedUser) {
    return this.addMany(id, [dto], user);
  }
  bulk(id: string, dto: BulkAddQuestionsDto, user: AuthenticatedUser) {
    return this.addMany(
      id,
      dto.questionIds.map((questionId) => ({ questionId })),
      user,
    );
  }
  private async addMany(id: string, items: AddQuestionDto[], user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      this.draft(t);
      const ids = items.map((x) => x.questionId);
      if (new Set(ids).size !== ids.length)
        throw new ConflictException('Duplicate Question IDs are not allowed');
      const questions = await m.getRepository(Question).findBy({ id: In(ids) });
      if (questions.length !== ids.length) throw new NotFoundException('Question not found');
      const existing = await m
        .getRepository(TestQuestion)
        .findBy({ testId: id, sourceQuestionId: In(ids) });
      if (existing.length) throw new ConflictException('Question already exists in Test');
      let position = await m.getRepository(TestQuestion).countBy({ testId: id });
      for (const input of items) {
        const q = questions.find((x) => x.id === input.questionId)!;
        this.eligible(q, t, user, false);
        const snapshot = await this.snapshots.fromQuestion(q, t.language, m, input.marks);
        position++;
        await m
          .getRepository(TestQuestion)
          .save({ ...snapshot, testId: id, position: input.position ?? position });
      }
      await this.normalize(id, m);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.question.add',
          entityType: 'test',
          entityId: id,
          metadata: { count: items.length },
        },
        m,
      );
      return this.read(id, m);
    });
  }
  async reorder(id: string, dto: ReorderQuestionsDto, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      this.draft(t);
      const current = await m.getRepository(TestQuestion).findBy({ testId: id });
      if (
        current.length !== dto.items.length ||
        new Set(dto.items.map((i) => i.position)).size !== current.length ||
        new Set(dto.items.map((i) => i.testQuestionId)).size !== current.length ||
        dto.items.some((i) => !current.some((q) => q.id === i.testQuestionId))
      )
        throw new BadRequestException('A full unique reorder is required');
      await m.query(`UPDATE test_questions SET position=position+1000000 WHERE test_id=$1`, [id]);
      for (const i of dto.items)
        await m.query(`UPDATE test_questions SET position=$2 WHERE id=$1 AND test_id=$3`, [
          i.testQuestionId,
          i.position,
          id,
        ]);
      await this.totals(id, m);
      await this.audit.record(
        { actorId: user.id, action: 'test.question.reorder', entityType: 'test', entityId: id },
        m,
      );
      return this.read(id, m);
    });
  }
  async remove(id: string, testQuestionId: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      this.draft(t);
      const result = await m.getRepository(TestQuestion).delete({ id: testQuestionId, testId: id });
      if (!result.affected) throw new NotFoundException('Test Question not found');
      await this.normalize(id, m);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.question.remove',
          entityType: 'test',
          entityId: id,
          metadata: { testQuestionId },
        },
        m,
      );
    });
  }
  async refresh(id: string, testQuestionId: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      this.draft(t);
      const tq = await m.getRepository(TestQuestion).findOneBy({ id: testQuestionId, testId: id });
      if (!tq) throw new NotFoundException('Test Question not found');
      const q = await m.getRepository(Question).findOneBy({ id: tq.sourceQuestionId });
      if (!q) throw new NotFoundException('Source Question not found');
      this.eligible(q, t, user, false);
      Object.assign(tq, await this.snapshots.fromQuestion(q, t.language, m, tq.marksSnapshot));
      await m.getRepository(TestQuestion).save(tq);
      await this.totals(id, m);
      return this.read(id, m);
    });
  }
  async finalize(id: string, user: AuthenticatedUser) {
    const result = await this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      if (t.status === TestStatus.FINALIZED) return this.read(id, m);
      this.draft(t);
      const qs = await m
        .getRepository(TestQuestion)
        .find({ where: { testId: id }, order: { position: 'ASC' } });
      if (!qs.length) throw new BadRequestException('A Test requires at least one Question');
      if (qs.some((q, i) => q.position !== i + 1))
        throw new BadRequestException('Test Question positions must be contiguous');
      const sources = await m
        .getRepository(Question)
        .findBy({ id: In(qs.map((q) => q.sourceQuestionId)) });
      for (const q of sources) this.eligible(q, t, user, true);
      if (sources.length !== qs.length)
        throw new BadRequestException('A source Question is unavailable');
      const ent = await this.entitlement.resolve(user, UsageMetric.TESTS, m);
      await this.usage.consume(ent, 1, 'TEST_FINALIZATION', id, user.id, m);
      const totals = this.calculate(qs);
      Object.assign(t, { status: TestStatus.FINALIZED, finalizedAt: new Date(), ...totals });
      await m.getRepository(ExamTest).save(t);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.finalize',
          entityType: 'test',
          entityId: id,
          metadata: totals,
        },
        m,
      );
      return this.read(id, m);
    });
    await this.notifications?.create({
      userId: user.id,
      type: NotificationType.TEST_FINALIZED,
      title: 'Test finalized',
      message: 'Your test was finalized and its question snapshot is now immutable.',
      deduplicationKey: `test:${id}:finalized:${user.id}`,
      metadata: { testId: id },
    });
    return result;
  }
  async clone(id: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const source = await this.lock(id, user, m);
      const copy = await m.getRepository(ExamTest).save({
        createdBy: user.id,
        schoolId: user.schoolId,
        classId: source.classId,
        sectionId: source.sectionId,
        subjectId: source.subjectId,
        title: `${source.title} (Copy)`,
        description: source.description,
        instructions: source.instructions,
        language: source.language,
        status: TestStatus.DRAFT,
        durationMinutes: source.durationMinutes,
        totalMarks: source.totalMarks,
        totalQuestions: source.totalQuestions,
        clonedFromTestId: source.id,
        finalizedAt: null,
        archivedAt: null,
      });
      const qs = await m.getRepository(TestQuestion).findBy({ testId: id });
      await m.getRepository(TestQuestion).save(
        qs.map((q) => ({
          testId: copy.id,
          sourceQuestionId: q.sourceQuestionId,
          position: q.position,
          type: q.type,
          questionTextSnapshot: q.questionTextSnapshot,
          marksSnapshot: q.marksSnapshot,
          difficultySnapshot: q.difficultySnapshot,
          languageSnapshot: q.languageSnapshot,
          optionsSnapshot: q.optionsSnapshot,
          answerSnapshot: q.answerSnapshot,
          explanationSnapshot: q.explanationSnapshot,
          sourceSnapshot: q.sourceSnapshot,
          groundingStatusSnapshot: q.groundingStatusSnapshot,
          reviewStatusSnapshot: q.reviewStatusSnapshot,
          citationSnapshot: q.citationSnapshot,
          chapterIdSnapshot: q.chapterIdSnapshot,
          topicIdSnapshot: q.topicIdSnapshot,
        })),
      );
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.clone',
          entityType: 'test',
          entityId: copy.id,
          metadata: { sourceTestId: id },
        },
        m,
      );
      return this.read(copy.id, m);
    });
  }
  async archive(id: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      const t = await this.lock(id, user, m);
      if (t.status === TestStatus.ARCHIVED) return;
      Object.assign(t, { status: TestStatus.ARCHIVED, archivedAt: new Date() });
      await m.getRepository(ExamTest).save(t);
      await this.audit.record(
        { actorId: user.id, action: 'test.archive', entityType: 'test', entityId: id },
        m,
      );
    });
  }
  private eligible(q: Question, t: ExamTest, user: AuthenticatedUser, finalizing: boolean) {
    if (user.role !== UserRole.SYSTEM_ADMIN && q.createdBy !== user.id)
      throw new ForbiddenException('Question belongs to another teacher');
    if (q.status !== QuestionStatus.ACTIVE) throw new BadRequestException('Question is not active');
    if (q.classId !== t.classId || q.subjectId !== t.subjectId)
      throw new BadRequestException('Question curriculum is incompatible with Test');
    if (
      finalizing &&
      q.source === QuestionSource.AI_GENERATED &&
      q.reviewStatus !== QuestionReviewStatus.APPROVED
    )
      throw new BadRequestException('All AI Questions must be approved before finalization');
  }
  private async validateScope(
    classId: string,
    sectionId: string | null,
    subjectId: string,
    m: EntityManager = this.data.manager,
  ) {
    const [cls, subject, section] = await Promise.all([
      m.getRepository(CurriculumClass).findOneBy({ id: classId }),
      m.getRepository(Subject).findOneBy({ id: subjectId }),
      sectionId ? m.getRepository(Section).findOneBy({ id: sectionId }) : null,
    ]);
    if (!cls || !subject || subject.classId !== classId)
      throw new BadRequestException('Subject does not belong to Class');
    if (sectionId && (!section || section.classId !== classId))
      throw new BadRequestException('Section does not belong to Class');
  }
  private async lock(id: string, user: AuthenticatedUser, m: EntityManager) {
    const t = await m
      .getRepository(ExamTest)
      .createQueryBuilder('test')
      .setLock('pessimistic_write')
      .where('test.id=:id', { id })
      .getOne();
    if (!t) throw new NotFoundException('Test not found');
    this.authorize(t, user);
    return t;
  }
  private async scoped(id: string, user: AuthenticatedUser) {
    const t = await this.tests.findOneBy({ id });
    if (!t) throw new NotFoundException('Test not found');
    this.authorize(t, user);
    return t;
  }
  private authorize(t: ExamTest, u: AuthenticatedUser) {
    if (u.role !== UserRole.SYSTEM_ADMIN && t.createdBy !== u.id)
      throw new ForbiddenException('You do not have permission to access this Test');
  }
  private scope(qb: SelectQueryBuilder<ExamTest>, u: AuthenticatedUser) {
    if (u.role !== UserRole.SYSTEM_ADMIN) qb.andWhere('test.createdBy=:owner', { owner: u.id });
    return qb;
  }
  private draft(t: ExamTest) {
    if (t.status !== TestStatus.DRAFT) throw new ConflictException('Only DRAFT Tests are mutable');
  }
  private async normalize(id: string, m: EntityManager) {
    const qs = await m
      .getRepository(TestQuestion)
      .find({ where: { testId: id }, order: { position: 'ASC', createdAt: 'ASC' } });
    await m.query(`UPDATE test_questions SET position=position+1000000 WHERE test_id=$1`, [id]);
    for (const [index, question] of qs.entries())
      await m.query(`UPDATE test_questions SET position=$2 WHERE id=$1`, [question.id, index + 1]);
    await this.totals(id, m);
  }
  private async totals(id: string, m: EntityManager) {
    const qs = await m.getRepository(TestQuestion).findBy({ testId: id });
    await m.getRepository(ExamTest).update(id, this.calculate(qs));
  }
  private calculate(qs: TestQuestion[]) {
    return {
      totalQuestions: qs.length,
      totalMarks: qs.reduce((s, q) => s + Number(q.marksSnapshot), 0),
    };
  }
  private meta(t: ExamTest) {
    return {
      id: t.id,
      title: t.title,
      classId: t.classId,
      sectionId: t.sectionId,
      subjectId: t.subjectId,
      status: t.status,
      durationMinutes: t.durationMinutes,
      totalMarks: t.totalMarks,
      totalQuestions: t.totalQuestions,
      version: t.version,
      finalizedAt: t.finalizedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
  private async read(id: string, manager: EntityManager) {
    const test = await manager.getRepository(ExamTest).findOneByOrFail({ id });
    const questions = await manager
      .getRepository(TestQuestion)
      .find({ where: { testId: id }, order: { position: 'ASC' } });
    return this.detail(test, questions, false);
  }
  private detail(t: ExamTest, qs: TestQuestion[], paper: boolean) {
    const typeSummary = qs.reduce<Record<string, number>>(
      (a, q) => ((a[q.type] = (a[q.type] ?? 0) + 1), a),
      {},
    );
    return {
      ...this.meta(t),
      description: t.description,
      instructions: t.instructions,
      language: t.language,
      clonedFromTestId: t.clonedFromTestId,
      typeSummary,
      questions: qs.map((q) => ({
        id: q.id,
        sourceQuestionId: q.sourceQuestionId,
        position: q.position,
        type: q.type,
        questionText: q.questionTextSnapshot,
        marks: q.marksSnapshot,
        difficulty: q.difficultySnapshot,
        options:
          q.optionsSnapshot?.map((o) =>
            paper ? { optionText: o.optionText, optionOrder: o.optionOrder } : o,
          ) ?? null,
        ...(paper
          ? {}
          : {
              source: q.sourceSnapshot,
              groundingStatus: q.groundingStatusSnapshot,
              reviewStatus: q.reviewStatusSnapshot,
              citations: q.citationSnapshot,
            }),
      })),
    };
  }
}
