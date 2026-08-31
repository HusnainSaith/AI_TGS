import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { EmbeddingConfigService } from '../embeddings/embedding-config.service';
import { QuestionOptionDto } from '../questions/dto/question.dto';
import { QuestionsService } from '../questions/questions.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { RetrievalEventStatus } from '../retrieval/retrieval.enums';
import { CreateGenerationDto } from './dto/generation.dto';
import { GenerationJobItem } from './entities/generation-job-item.entity';
import { GenerationJob } from './entities/generation-job.entity';
import {
  AiErrorCode,
  GenerationItemStatus,
  GenerationJobStatus,
  GroundingMode,
} from './generation.enums';
import {
  AI_GENERATION_PROVIDER,
  AiGenerationProvider,
  GenerationUnit,
  ValidatedCurriculum,
} from './generation.contracts';
import { GenerationCurriculumService } from './generation-curriculum.service';
import { GenerationEntitlementService } from './generation-entitlement.service';
import { GenerationOutputValidator } from './generation-output-validator.service';
import { GenerationUnitExpander } from './generation-unit-expander.service';
import { GroundedPromptBuilder } from './grounded-prompt-builder.service';

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly data: DataSource,
    @InjectRepository(GenerationJob) private readonly jobs: Repository<GenerationJob>,
    @InjectRepository(GenerationJobItem) private readonly items: Repository<GenerationJobItem>,
    private readonly config: ConfigService,
    private readonly curriculum: GenerationCurriculumService,
    private readonly expander: GenerationUnitExpander,
    private readonly retrieval: RetrievalService,
    private readonly questions: QuestionsService,
    private readonly output: GenerationOutputValidator,
    private readonly prompts: GroundedPromptBuilder,
    private readonly embeddingConfig: EmbeddingConfigService,
    private readonly entitlements: GenerationEntitlementService,
    private readonly audit: AuditService,
    @Inject(AI_GENERATION_PROVIDER) private readonly provider: AiGenerationProvider,
  ) {}

  async create(dto: CreateGenerationDto, user: AuthenticatedUser) {
    if (dto.knowledgeBase.mode !== GroundingMode.REQUIRED)
      throw new BadRequestException('Only REQUIRED grounding mode is enabled for MVP');
    const units = this.expander.expand(dto);
    const paths = await this.curriculum.validate(dto);
    this.entitlements.check(
      user,
      units.reduce((sum, unit) => sum + unit.count, 0),
    );
    const embedding = this.embeddingConfig.active();
    const job = await this.data.transaction(async (manager) => {
      const saved = await manager.getRepository(GenerationJob).save({
        requestedBy: user.id,
        requestPayload: dto as unknown as Record<string, unknown>,
        status: GenerationJobStatus.QUEUED,
        requestedCount: units.reduce((sum, unit) => sum + unit.count, 0),
        generatedCount: 0,
        failedCount: 0,
        provider: this.config.getOrThrow<string>('aiGeneration.provider'),
        model: this.config.get<string>('aiGeneration.model') ?? '',
        promptStrategyVersion: this.prompts.strategyVersion,
        retrievalStrategyVersion: this.config.getOrThrow<string>('retrieval.strategyVersion'),
        embeddingConfigVersion: embedding.configVersion,
        groundingMode: GroundingMode.REQUIRED,
        tokenUsage: null,
        cost: null,
        errorCode: null,
        processingToken: null,
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
      });
      await manager.getRepository(GenerationJobItem).save(
        units.map((unit) => ({
          generationJobId: saved.id,
          questionId: null,
          unitTopicId: unit.topicId,
          unitType: unit.type,
          difficulty: unit.difficulty,
          requestedCount: unit.count,
          generatedCount: 0,
          status: GenerationItemStatus.QUEUED,
          retrievalEventId: null,
          retryCount: 0,
          rejectionReason: null,
          errorCode: null,
          requestMetadata: {
            ...unit,
            curriculum: paths.get(unit.topicId),
            language: dto.language,
            documentIds: dto.knowledgeBase.documentIds ?? [],
          },
          processingToken: null,
          leaseExpiresAt: null,
          startedAt: null,
          completedAt: null,
        })),
      );
      await this.audit.record(
        {
          actorId: user.id,
          action: 'ai.generation.job.create',
          entityType: 'generation_job',
          entityId: saved.id,
          metadata: {
            requestedCount: saved.requestedCount,
            unitCount: units.length,
            groundingMode: saved.groundingMode,
          },
        },
        manager,
      );
      return saved;
    });
    return {
      id: job.id,
      status: job.status,
      requestedCount: job.requestedCount,
      itemCount: units.length,
      configured: this.providerConfigured(),
    };
  }

  async process(jobId: string, user: AuthenticatedUser) {
    await this.scoped(jobId, user);
    const token = randomUUID();
    const claimed = await this.data.query(
      `UPDATE generation_jobs SET status='PROCESSING',processing_token=$2,lease_expires_at=now()+($3||' minutes')::interval,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND (status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now()) OR status IN ('PARTIAL','FAILED')) RETURNING id`,
      [jobId, token, this.config.getOrThrow<number>('aiGeneration.staleMinutes')],
    );
    if (!claimed.length) throw new ConflictException('Generation Job is not claimable');
    await this.audit.record({
      actorId: user.id,
      action: 'ai.generation.start',
      entityType: 'generation_job',
      entityId: jobId,
    });
    const pending = await this.items.find({
      where: { generationJobId: jobId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const item of pending.filter((value) => value.status !== GenerationItemStatus.COMPLETED))
      await this.processItem(item, user);
    return this.aggregate(jobId, user, token);
  }

  private async processItem(item: GenerationJobItem, user: AuthenticatedUser) {
    const token = randomUUID();
    const claimed = await this.data.query(
      `UPDATE generation_job_items SET status='PROCESSING',processing_token=$2,lease_expires_at=now()+($3||' minutes')::interval,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND (status IN ('QUEUED','FAILED','INSUFFICIENT_KNOWLEDGE') OR (status='PROCESSING' AND lease_expires_at<now())) RETURNING id`,
      [item.id, token, this.config.getOrThrow<number>('aiGeneration.staleMinutes')],
    );
    if (!claimed.length) return;
    await this.audit.record({
      actorId: user.id,
      action: 'ai.generation.item.start',
      entityType: 'generation_job_item',
      entityId: item.id,
    });
    const meta = item.requestMetadata as unknown as {
      curriculum: ValidatedCurriculum;
      language: string;
      documentIds: string[];
    };
    const unit: GenerationUnit = {
      topicId: item.unitTopicId,
      chapterId: meta.curriculum.chapterId,
      type: item.unitType,
      difficulty: item.difficulty,
      count: item.requestedCount,
    };
    try {
      const retrieval = await this.retrieval.preview(
        {
          queryText: `${meta.curriculum.className} ${meta.curriculum.subjectName} ${meta.curriculum.chapterName} ${meta.curriculum.topicName} ${meta.curriculum.topicDescription ?? ''} ${item.unitType} ${item.difficulty}`,
          boardId: meta.curriculum.boardId,
          classId: meta.curriculum.classId,
          subjectId: meta.curriculum.subjectId,
          chapterId: meta.curriculum.chapterId,
          topicId: meta.curriculum.topicId,
          language: meta.language,
          documentIds: meta.documentIds.length ? meta.documentIds : undefined,
        },
        user,
      );
      if (retrieval.status === RetrievalEventStatus.INSUFFICIENT_KNOWLEDGE) {
        await this.finishItem(
          item.id,
          token,
          GenerationItemStatus.INSUFFICIENT_KNOWLEDGE,
          0,
          retrieval.retrievalEventId,
          AiErrorCode.INSUFFICIENT_KNOWLEDGE,
        );
        await this.audit.record({
          actorId: user.id,
          action: 'ai.generation.item.insufficient',
          entityType: 'generation_job_item',
          entityId: item.id,
          metadata: { retrievalEventId: retrieval.retrievalEventId },
        });
        return;
      }
      const prompt = this.prompts.build(unit, meta.curriculum, meta.language, retrieval.evidence);
      if (item.retryCount > 0)
        prompt.user += `\nRegeneration variant: ${item.retryCount}. Produce a distinct valid question while remaining grounded.`;
      const result = await this.invoke(prompt, item.id);
      const generated = this.output.validate(
        result.output,
        unit,
        new Set(retrieval.evidence.map((e) => e.label)),
      );
      const questions = await this.data.transaction(async (manager) => {
        const saved = [];
        for (const question of generated) {
          const citations = question.citations.map((label) => {
            const evidence = retrieval.evidence.find((entry) => entry.label === label)!;
            return {
              contentChunkId: evidence.contentChunkId,
              documentVersionId: evidence.documentVersionId,
              locator: evidence.locator,
              contentHash: evidence.contentHash,
              score: evidence.hybridScore,
            };
          });
          saved.push(
            await this.questions.createGenerated(
              {
                topicId: meta.curriculum.topicId,
                chapterId: meta.curriculum.chapterId,
                subjectId: meta.curriculum.subjectId,
                classId: meta.curriculum.classId,
                type: question.type,
                questionText: question.questionText,
                difficulty: question.difficulty,
                marks: question.marks,
                explanation: question.explanation ?? null,
                options: (question.options ?? []).map((option, index): QuestionOptionDto => ({
                  optionText: option.text,
                  optionOrder: index + 1,
                  isCorrect: option.isCorrect,
                })),
                generationJobId: item.generationJobId,
                generationJobItemId: item.id,
                retrievalEventId: retrieval.retrievalEventId,
                citations,
              },
              user,
              manager,
            ),
          );
        }
        await manager.getRepository(GenerationJobItem).update(
          { id: item.id, processingToken: token },
          {
            status: GenerationItemStatus.COMPLETED,
            generatedCount: saved.length,
            questionId: saved[0]?.id ?? null,
            retrievalEventId: retrieval.retrievalEventId,
            completedAt: new Date(),
            leaseExpiresAt: null,
            processingToken: null,
            errorCode: null,
            rejectionReason: null,
          },
        );
        return saved;
      });
      await this.audit.record({
        actorId: user.id,
        action: 'ai.generation.item.complete',
        entityType: 'generation_job_item',
        entityId: item.id,
        metadata: {
          generatedCount: questions.length,
          retrievalEventId: retrieval.retrievalEventId,
          requestCount: 1,
          latencyMs: result.latencyMs,
          usage: result.usage,
        },
      });
      if (result.usage)
        await this.data.query(
          `UPDATE generation_jobs SET token_usage=jsonb_build_object(
            'inputTokens',COALESCE((token_usage->>'inputTokens')::int,0)+$2,
            'outputTokens',COALESCE((token_usage->>'outputTokens')::int,0)+$3,
            'totalTokens',COALESCE((token_usage->>'totalTokens')::int,0)+$4,
            'requestCount',COALESCE((token_usage->>'requestCount')::int,0)+1)
           WHERE id=$1`,
          [
            item.generationJobId,
            result.usage.inputTokens ?? 0,
            result.usage.outputTokens ?? 0,
            result.usage.totalTokens ?? 0,
          ],
        );
    } catch (error) {
      const code = this.errorCode(error);
      await this.finishItem(item.id, token, GenerationItemStatus.FAILED, 0, null, code);
      await this.audit.record({
        actorId: user.id,
        action: 'ai.generation.item.failed',
        entityType: 'generation_job_item',
        entityId: item.id,
        metadata: { errorCode: code },
        outcome: 'FAILED',
      });
    }
  }

  private async invoke(
    prompt: Parameters<AiGenerationProvider['generateQuestions']>[0],
    itemId: string,
  ) {
    const max = this.config.getOrThrow<number>('aiGeneration.maxRetries');
    let last: unknown;
    for (let attempt = 0; attempt <= max; attempt++)
      try {
        return await this.provider.generateQuestions(prompt);
      } catch (error) {
        last = error;
        const retryable = [
          AiErrorCode.TIMEOUT,
          AiErrorCode.RATE_LIMITED,
          AiErrorCode.PROVIDER_ERROR,
        ].includes(this.errorCode(error) as AiErrorCode);
        if (!retryable || attempt === max) break;
        await this.items.increment({ id: itemId }, 'retryCount', 1);
      }
    throw last;
  }
  private finishItem(
    id: string,
    token: string,
    status: GenerationItemStatus,
    generatedCount: number,
    retrievalEventId: string | null,
    errorCode: string,
  ) {
    return this.items.update(
      { id, processingToken: token },
      {
        status,
        generatedCount,
        retrievalEventId,
        errorCode,
        rejectionReason: errorCode,
        completedAt: new Date(),
        leaseExpiresAt: null,
        processingToken: null,
      },
    );
  }
  private async aggregate(jobId: string, user: AuthenticatedUser, token: string) {
    const items = await this.items.findBy({ generationJobId: jobId });
    const generated = items.reduce((sum, item) => sum + item.generatedCount, 0);
    const failed = items.filter(
      (item) =>
        item.status === GenerationItemStatus.FAILED ||
        item.status === GenerationItemStatus.INSUFFICIENT_KNOWLEDGE,
    ).length;
    const status =
      generated === 0
        ? GenerationJobStatus.FAILED
        : failed
          ? GenerationJobStatus.PARTIAL
          : GenerationJobStatus.COMPLETED;
    await this.jobs.update(
      { id: jobId, processingToken: token },
      {
        status,
        generatedCount: generated,
        failedCount: failed,
        completedAt: new Date(),
        leaseExpiresAt: null,
        processingToken: null,
        errorCode: generated ? null : (items[0]?.errorCode ?? AiErrorCode.PROVIDER_ERROR),
      },
    );
    await this.audit.record({
      actorId: user.id,
      action:
        status === GenerationJobStatus.COMPLETED
          ? 'ai.generation.complete'
          : status === GenerationJobStatus.PARTIAL
            ? 'ai.generation.partial'
            : 'ai.generation.failed',
      entityType: 'generation_job',
      entityId: jobId,
      metadata: { generatedCount: generated, failedCount: failed },
      outcome: status === GenerationJobStatus.FAILED ? 'FAILED' : 'SUCCEEDED',
    });
    return this.get(jobId, user);
  }
  async get(id: string, user: AuthenticatedUser) {
    return this.scoped(id, user, true);
  }
  async listItems(id: string, user: AuthenticatedUser) {
    await this.scoped(id, user);
    return this.items.find({ where: { generationJobId: id }, order: { createdAt: 'ASC' } });
  }
  async retrievalEvents(id: string, user: AuthenticatedUser) {
    await this.scoped(id, user);
    const result: unknown = await this.data.query(
      `SELECT i.id generation_item_id,i.retrieval_event_id,e.status,e.strategy_version,e.candidate_count,e.result_count,e.latency_ms FROM generation_job_items i LEFT JOIN retrieval_events e ON e.id=i.retrieval_event_id WHERE i.generation_job_id=$1 ORDER BY i.created_at`,
      [id],
    );
    return result as Array<Record<string, unknown>>;
  }
  async regenerate(jobId: string, itemId: string, user: AuthenticatedUser) {
    await this.scoped(jobId, user);
    const item = await this.items.findOneBy({ id: itemId, generationJobId: jobId });
    if (!item) throw new NotFoundException('Generation Job Item not found');
    await this.items.update(item.id, {
      status: GenerationItemStatus.QUEUED,
      questionId: null,
      generatedCount: 0,
      retrievalEventId: null,
      retryCount: item.retryCount + 1,
      errorCode: null,
      rejectionReason: null,
      completedAt: null,
    });
    await this.jobs.update(jobId, {
      status: GenerationJobStatus.QUEUED,
      completedAt: null,
      errorCode: null,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'ai.generation.regenerate',
      entityType: 'generation_job_item',
      entityId: item.id,
      metadata: { retryCount: item.retryCount + 1 },
    });
    return this.process(jobId, user);
  }
  async cancel(id: string, user: AuthenticatedUser) {
    const job = await this.scoped(id, user);
    if (job.status === GenerationJobStatus.PROCESSING)
      throw new ConflictException('Processing Generation Job cannot be cancelled');
    await this.jobs.update(id, {
      status: GenerationJobStatus.FAILED,
      errorCode: AiErrorCode.CANCELLED,
      completedAt: new Date(),
    });
    await this.audit.record({
      actorId: user.id,
      action: 'ai.generation.cancel',
      entityType: 'generation_job',
      entityId: id,
    });
  }
  private async scoped(id: string, user: AuthenticatedUser, relations = false) {
    const job = await this.jobs.findOne({
      where: { id },
      relations: relations ? { items: true } : undefined,
    });
    if (!job) throw new NotFoundException('Generation Job not found');
    if (user.role !== UserRole.SYSTEM_ADMIN && job.requestedBy !== user.id)
      throw new ForbiddenException('You do not have permission to access this Generation Job');
    return job;
  }
  private providerConfigured() {
    return (
      this.config.get<string>('aiGeneration.provider') === 'test' ||
      Boolean(
        this.config.get<string>('aiGeneration.model') &&
        this.config.get<string>('aiGeneration.apiKey'),
      )
    );
  }
  private errorCode(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return (Object.values(AiErrorCode) as string[]).includes(message)
      ? message
      : error instanceof ConflictException
        ? AiErrorCode.DUPLICATE_REJECTED
        : AiErrorCode.SCHEMA_VALIDATION_FAILED;
  }
}
