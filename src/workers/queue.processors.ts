import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { DurableJobPayload, QUEUES } from '../infrastructure/queue/queue.constants';
import { AiGenerationService } from '../modules/ai-generation/ai-generation.service';
import { GenerationJob } from '../modules/ai-generation/entities/generation-job.entity';
import { AiErrorCode, GenerationJobStatus } from '../modules/ai-generation/generation.enums';
import { EmbeddingService } from '../modules/embeddings/embedding.service';
import { EmbeddingJob } from '../modules/embeddings/entities/embedding-job.entity';
import { EmbeddingJobStatus } from '../modules/embeddings/embedding.enums';
import { IngestionJob } from '../modules/ingestion/entities/ingestion-job.entity';
import { IngestionJobStatus } from '../modules/ingestion/enums/ingestion.enums';
import { IngestionProcessorService } from '../modules/ingestion/ingestion-processor.service';
import { TestExport } from '../modules/test-exports/entities/test-export.entity';
import { TestExportStatus } from '../modules/test-exports/test-export.enums';
import { TestExportsService } from '../modules/test-exports/test-exports.service';
import { User } from '../modules/users/user.entity';

const concurrency = (name: string, fallback: number) =>
  Math.max(1, Number(process.env[name] ?? fallback));
abstract class LoggedWorker extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);
  protected async timed(job: Job<DurableJobPayload>, action: () => Promise<unknown>) {
    const started = Date.now();
    this.logger.log(
      `worker start queue=${job.queueName} bullJobId=${job.id} jobId=${job.data.jobId} attempt=${job.attemptsMade + 1}`,
    );
    try {
      const result = await action();
      this.logger.log(
        `worker finish queue=${job.queueName} bullJobId=${job.id} jobId=${job.data.jobId} durationMs=${Date.now() - started}`,
      );
      return result;
    } catch (error) {
      this.logger.warn(
        `worker error queue=${job.queueName} bullJobId=${job.id} jobId=${job.data.jobId} durationMs=${Date.now() - started} code=${error instanceof Error ? error.name : 'UNKNOWN'}`,
      );
      throw error;
    }
  }
}

@Processor(QUEUES.KB_INGESTION, { concurrency: concurrency('WORKER_INGESTION_CONCURRENCY', 2) })
export class IngestionQueueProcessor extends LoggedWorker {
  constructor(
    @InjectRepository(IngestionJob) private jobs: Repository<IngestionJob>,
    private service: IngestionProcessorService,
  ) {
    super();
  }
  process(job: Job<DurableJobPayload>) {
    return this.timed(job, async () => {
      const state = await this.jobs.findOneBy({ id: job.data.jobId });
      if (
        !state ||
        [IngestionJobStatus.COMPLETED, IngestionJobStatus.AWAITING_MAPPING].includes(state.status)
      )
        return { skipped: true };
      return this.service.processJob(state.id);
    });
  }
}

@Processor(QUEUES.EMBEDDINGS, { concurrency: concurrency('WORKER_EMBEDDING_CONCURRENCY', 2) })
export class EmbeddingQueueProcessor extends LoggedWorker {
  constructor(
    @InjectRepository(EmbeddingJob) private jobs: Repository<EmbeddingJob>,
    private service: EmbeddingService,
  ) {
    super();
  }
  process(job: Job<DurableJobPayload>) {
    return this.timed(job, async () => {
      const state = await this.jobs.findOneBy({ id: job.data.jobId });
      if (!state || state.status === EmbeddingJobStatus.COMPLETED) return { skipped: true };
      return this.service.process(state.id);
    });
  }
}

@Processor(QUEUES.AI_GENERATION, {
  concurrency: concurrency('WORKER_AI_GENERATION_CONCURRENCY', 1),
})
export class AiGenerationQueueProcessor extends LoggedWorker {
  constructor(
    @InjectRepository(GenerationJob) private jobs: Repository<GenerationJob>,
    @InjectRepository(User) private users: Repository<User>,
    private service: AiGenerationService,
  ) {
    super();
  }
  process(job: Job<DurableJobPayload>) {
    return this.timed(job, async () => {
      const state = await this.jobs.findOneBy({ id: job.data.jobId });
      if (
        !state ||
        state.status === GenerationJobStatus.COMPLETED ||
        (state.status === GenerationJobStatus.FAILED && state.errorCode === AiErrorCode.CANCELLED)
      )
        return { skipped: true };
      const user = await this.users.findOneByOrFail({ id: state.requestedBy });
      return this.service.process(state.id, this.user(user));
    });
  }
  private user(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      emailVerified: user.emailVerified,
    };
  }
}

@Processor(QUEUES.PDF_EXPORTS, { concurrency: concurrency('WORKER_PDF_CONCURRENCY', 2) })
export class PdfExportQueueProcessor extends LoggedWorker {
  constructor(
    @InjectRepository(TestExport) private exports: Repository<TestExport>,
    @InjectRepository(User) private users: Repository<User>,
    private service: TestExportsService,
  ) {
    super();
  }
  process(job: Job<DurableJobPayload>) {
    return this.timed(job, async () => {
      const state = await this.exports.findOneBy({ id: job.data.jobId });
      if (!state || [TestExportStatus.COMPLETED, TestExportStatus.ARCHIVED].includes(state.status))
        return { skipped: true };
      const user = await this.users.findOneByOrFail({ id: state.requestedBy });
      return this.service.process(state.id, this.user(user));
    });
  }
  private user(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      emailVerified: user.emailVerified,
    };
  }
}
