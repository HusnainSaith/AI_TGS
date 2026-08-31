import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { Topic } from '../curriculum/curriculum.entities';
import { CurriculumStatus } from '../curriculum/curriculum-status.enum';
import { orderColumn, paginate } from '../curriculum/curriculum.utils';
import {
  CreateQuestionDto,
  ListQuestionsDto,
  QuestionOptionDto,
  QuestionResponse,
  UpdateQuestionDto,
} from './dto/question.dto';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { QuestionCitation } from './entities/question-citation.entity';
import { QuestionDifficulty, QuestionType } from './enums/question.enums';
import {
  GroundingStatus,
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
} from './enums/question.enums';
import { QuestionValidatorService } from './question-validator.service';
@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    private readonly data: DataSource,
    private readonly validator: QuestionValidatorService,
    private readonly audit: AuditService,
  ) {}
  private async validatePath(input: {
    topicId: string;
    chapterId: string;
    subjectId: string;
    classId: string;
  }): Promise<void> {
    const topic = await this.topics
      .createQueryBuilder('topic')
      .innerJoinAndSelect('topic.chapter', 'chapter')
      .innerJoinAndSelect('chapter.subject', 'subject')
      .innerJoinAndSelect('subject.curriculumClass', 'class')
      .innerJoinAndSelect('subject.board', 'board')
      .where('topic.id = :topicId', { topicId: input.topicId })
      .andWhere(
        'topic.status=:active AND chapter.status=:active AND subject.status=:active AND class.status=:active AND board.status=:active',
        { active: CurriculumStatus.ACTIVE },
      )
      .getOne();
    if (!topic)
      throw new BadRequestException('Question curriculum hierarchy is missing or archived');
    if (topic.chapterId !== input.chapterId)
      throw new BadRequestException('Topic does not belong to the specified Chapter');
    if (topic.chapter.subjectId !== input.subjectId)
      throw new BadRequestException('Chapter does not belong to the specified Subject');
    if (topic.chapter.subject.classId !== input.classId)
      throw new BadRequestException('Subject does not belong to the specified Class');
  }
  private async ensureNoDuplicate(
    manager: EntityManager,
    createdBy: string,
    topicId: string,
    text: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = manager
      .getRepository(Question)
      .createQueryBuilder('q')
      .where('q.createdBy=:createdBy', { createdBy })
      .andWhere('q.topicId=:topicId', { topicId })
      .andWhere('q.status=:status', { status: QuestionStatus.ACTIVE })
      .andWhere(
        "lower(regexp_replace(btrim(q.questionText), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(:text), '\\s+', ' ', 'g'))",
        { text },
      );
    if (excludeId) qb.andWhere('q.id != :excludeId', { excludeId });
    if (await qb.getExists())
      throw new ConflictException('A matching question already exists for this owner and Topic');
  }
  private scope(
    qb: ReturnType<Repository<Question>['createQueryBuilder']>,
    user: AuthenticatedUser,
  ) {
    if (user.role !== UserRole.SYSTEM_ADMIN)
      qb.andWhere('question.createdBy=:ownerId', { ownerId: user.id });
    return qb;
  }
  private response(q: Question): QuestionResponse {
    return {
      id: q.id,
      topicId: q.topicId,
      chapterId: q.chapterId,
      subjectId: q.subjectId,
      classId: q.classId,
      type: q.type,
      questionText: q.questionText,
      difficulty: q.difficulty,
      marks: q.marks,
      explanation: q.explanation,
      source: q.source,
      reviewStatus: q.reviewStatus,
      status: q.status,
      groundingStatus: q.groundingStatus,
      options: (q.options ?? [])
        .sort((a, b) => a.optionOrder - b.optionOrder)
        .map((o) => ({
          id: o.id,
          optionText: o.optionText,
          optionOrder: o.optionOrder,
          isCorrect: o.isCorrect,
        })),
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    };
  }
  private async scoped(id: string, user: AuthenticatedUser, activeOnly = true): Promise<Question> {
    const qb = this.questions
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.options', 'option')
      .where('question.id=:id', { id });
    this.scope(qb, user);
    if (activeOnly) qb.andWhere('question.status=:status', { status: QuestionStatus.ACTIVE });
    const q = await qb.orderBy('option.optionOrder', 'ASC').getOne();
    if (q) return q;
    const existing = await this.questions.findOne({
      select: { id: true, createdBy: true },
      where: { id },
    });
    if (existing && user.role !== UserRole.SYSTEM_ADMIN && existing.createdBy !== user.id)
      throw new ForbiddenException('You do not have permission to access this question');
    throw new NotFoundException('Question not found');
  }
  private async replaceOptions(
    manager: EntityManager,
    questionId: string,
    options: QuestionOptionDto[],
  ): Promise<void> {
    await manager.getRepository(QuestionOption).delete({ questionId });
    if (options.length)
      await manager.getRepository(QuestionOption).insert(
        options.map((o) => ({
          questionId,
          optionText: o.optionText.trim(),
          optionOrder: o.optionOrder,
          isCorrect: o.isCorrect,
        })),
      );
  }
  async create(dto: CreateQuestionDto, user: AuthenticatedUser): Promise<QuestionResponse> {
    await this.validatePath(dto);
    this.validator.validate(dto.type, dto.options);
    return this.data.transaction(async (manager) => {
      await this.ensureNoDuplicate(manager, user.id, dto.topicId, dto.questionText);
      const { options, ...fields } = dto;
      const q = await manager.getRepository(Question).save({
        ...fields,
        questionText: fields.questionText.trim(),
        explanation: fields.explanation?.trim() || null,
        createdBy: user.id,
        source: QuestionSource.MANUAL,
        reviewStatus: QuestionReviewStatus.APPROVED,
        status: QuestionStatus.ACTIVE,
        groundingStatus: GroundingStatus.NOT_APPLICABLE,
        generationJobId: null,
        retrievalEventId: null,
      });
      await this.replaceOptions(manager, q.id, options ?? []);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'question.create',
          entityType: 'question',
          entityId: q.id,
          metadata: { source: q.source, type: q.type, topicId: q.topicId },
        },
        manager,
      );
      return this.response(
        await manager
          .getRepository(Question)
          .findOneOrFail({ where: { id: q.id }, relations: { options: true } }),
      );
    });
  }
  async createGenerated(
    input: {
      topicId: string;
      chapterId: string;
      subjectId: string;
      classId: string;
      type: QuestionType;
      questionText: string;
      difficulty: QuestionDifficulty;
      marks: number;
      explanation: string | null;
      options: QuestionOptionDto[];
      generationJobId: string;
      generationJobItemId: string;
      retrievalEventId: string;
      citations: Array<{
        contentChunkId: string;
        documentVersionId: string;
        locator: Record<string, unknown>;
        contentHash: string;
        score: number;
      }>;
    },
    user: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<Question> {
    await this.validatePath(input);
    this.validator.validate(input.type, input.options);
    await this.ensureNoDuplicate(manager, user.id, input.topicId, input.questionText);
    const question = await manager.getRepository(Question).save({
      topicId: input.topicId,
      chapterId: input.chapterId,
      subjectId: input.subjectId,
      classId: input.classId,
      type: input.type,
      questionText: input.questionText.trim(),
      difficulty: input.difficulty,
      marks: input.marks,
      explanation: input.explanation,
      createdBy: user.id,
      source: QuestionSource.AI_GENERATED,
      reviewStatus: QuestionReviewStatus.PENDING,
      status: QuestionStatus.ACTIVE,
      groundingStatus: GroundingStatus.GROUNDED,
      generationJobId: input.generationJobId,
      generationJobItemId: input.generationJobItemId,
      retrievalEventId: input.retrievalEventId,
    });
    await this.replaceOptions(manager, question.id, input.options);
    await manager.getRepository(QuestionCitation).save(
      input.citations.map((citation, index) =>
        manager.getRepository(QuestionCitation).create({
          questionId: question.id,
          retrievalEventId: input.retrievalEventId,
          contentChunkId: citation.contentChunkId,
          documentVersionId: citation.documentVersionId,
          locator: citation.locator,
          excerptHash: citation.contentHash,
          retrievalScore: citation.score,
          citationOrder: index + 1,
        }),
      ),
    );
    await this.audit.record(
      {
        actorId: user.id,
        action: 'question.ai.create',
        entityType: 'question',
        entityId: question.id,
        metadata: {
          type: input.type,
          topicId: input.topicId,
          generationJobId: input.generationJobId,
          retrievalEventId: input.retrievalEventId,
          citationCount: input.citations.length,
        },
      },
      manager,
    );
    return question;
  }
  async list(query: ListQuestionsDto, user: AuthenticatedUser) {
    const qb = this.questions
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.options', 'option')
      .innerJoin('question.topic', 'topic')
      .innerJoin('question.chapter', 'chapter')
      .innerJoin('question.subject', 'subject')
      .innerJoin('question.curriculumClass', 'class')
      .where('question.status=:status', { status: query.status ?? QuestionStatus.ACTIVE });
    this.scope(qb, user);
    for (const [key, value] of Object.entries({
      classId: query.classId,
      subjectId: query.subjectId,
      chapterId: query.chapterId,
      topicId: query.topicId,
      type: query.type,
      difficulty: query.difficulty,
      source: query.source,
      reviewStatus: query.reviewStatus,
      marks: query.marks,
    }))
      if (value !== undefined) qb.andWhere(`question.${key} = :${key}`, { [key]: value });
    if (query.search)
      qb.andWhere(
        '(question.questionText ILIKE :search OR question.explanation ILIKE :search OR topic.name ILIKE :search OR chapter.name ILIKE :search OR subject.name ILIKE :search OR class.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    qb.orderBy(
      orderColumn(
        query.sortBy,
        {
          createdAt: 'question.createdAt',
          updatedAt: 'question.updatedAt',
          difficulty: 'question.difficulty',
          marks: 'question.marks',
          questionText: 'question.questionText',
        },
        'question.createdAt',
      ),
      query.sortOrder,
    ).addOrderBy('option.optionOrder', 'ASC');
    const page = await paginate(qb, query);
    return { ...page, items: page.items.map((q) => this.response(q)) };
  }
  async find(id: string, user: AuthenticatedUser) {
    return this.response(await this.scoped(id, user));
  }
  async update(
    id: string,
    dto: UpdateQuestionDto,
    user: AuthenticatedUser,
  ): Promise<QuestionResponse> {
    const current = await this.scoped(id, user);
    if (user.role !== UserRole.SYSTEM_ADMIN && current.source !== QuestionSource.MANUAL)
      throw new ForbiddenException('Teachers may update only their own manual questions');
    const path = {
      topicId: dto.topicId ?? current.topicId,
      chapterId: dto.chapterId ?? current.chapterId,
      subjectId: dto.subjectId ?? current.subjectId,
      classId: dto.classId ?? current.classId,
    };
    await this.validatePath(path);
    const nextType = dto.type ?? current.type;
    const typeChanged = dto.type !== undefined && dto.type !== current.type;
    const nextOptions =
      dto.options ??
      (typeChanged
        ? []
        : current.options.map((o) => ({
            optionText: o.optionText,
            optionOrder: o.optionOrder,
            isCorrect: o.isCorrect,
          })));
    this.validator.validate(nextType, nextOptions);
    return this.data.transaction(async (manager) => {
      const text = dto.questionText ?? current.questionText;
      await this.ensureNoDuplicate(manager, current.createdBy, path.topicId, text, id);
      const { options, ...fields } = dto;
      await manager.getRepository(Question).update(id, {
        ...fields,
        ...path,
        questionText: text.trim(),
        explanation:
          dto.explanation === undefined ? current.explanation : dto.explanation.trim() || null,
      });
      if (options !== undefined || typeChanged) await this.replaceOptions(manager, id, nextOptions);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'question.update',
          entityType: 'question',
          entityId: id,
          metadata: { type: nextType, fields: Object.keys(dto) },
        },
        manager,
      );
      return this.response(
        await manager
          .getRepository(Question)
          .findOneOrFail({ where: { id }, relations: { options: true } }),
      );
    });
  }
  async archive(id: string, user: AuthenticatedUser): Promise<void> {
    const q = await this.scoped(id, user);
    if (user.role !== UserRole.SYSTEM_ADMIN && q.source !== QuestionSource.MANUAL)
      throw new ForbiddenException('Teachers may archive only their own manual questions');
    await this.data.transaction(async (manager) => {
      await manager.getRepository(Question).update(id, { status: QuestionStatus.ARCHIVED });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'question.archive',
          entityType: 'question',
          entityId: id,
          metadata: { source: q.source, type: q.type },
        },
        manager,
      );
    });
  }
  async approve(id: string, user: AuthenticatedUser): Promise<QuestionResponse> {
    const q = await this.scoped(id, user);
    if (user.role !== UserRole.SYSTEM_ADMIN && q.createdBy !== user.id)
      throw new ForbiddenException('You do not have permission to approve this question');
    if (q.reviewStatus === QuestionReviewStatus.APPROVED) return this.response(q);
    return this.data.transaction(async (manager) => {
      await manager
        .getRepository(Question)
        .update(id, { reviewStatus: QuestionReviewStatus.APPROVED });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'question.approve',
          entityType: 'question',
          entityId: id,
          metadata: { source: q.source },
        },
        manager,
      );
      return this.response(
        await manager
          .getRepository(Question)
          .findOneOrFail({ where: { id }, relations: { options: true } }),
      );
    });
  }
}
