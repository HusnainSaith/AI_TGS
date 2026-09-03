import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { isUUID } from 'class-validator';
import { DurableJobPayload, QUEUE_JOB_NAMES, QUEUES } from './queue.constants';

export interface QueueDispatchResult {
  dispatched: boolean;
  queue: string;
  bullJobId: string | null;
}

abstract class DurableQueueProducer {
  protected readonly logger = new Logger(this.constructor.name);
  protected constructor(
    private readonly queue: Queue<DurableJobPayload>,
    private readonly config: ConfigService,
    private readonly queueName: string,
    private readonly jobName: string,
  ) {}
  async dispatch(jobId: string): Promise<QueueDispatchResult> {
    if (!isUUID(jobId)) throw new Error('Queue dispatch requires a UUID jobId');
    if (!this.config.get<boolean>('queue.enabled'))
      return { dispatched: false, queue: this.queueName, bullJobId: null };
    const options: JobsOptions = {
      jobId,
      attempts: this.config.get<number>('queue.attempts') ?? 3,
      backoff: { type: 'exponential', delay: this.config.get<number>('queue.backoffMs') ?? 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    };
    try {
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'completed' || state === 'failed') await existing.remove();
        else
          return {
            dispatched: true,
            queue: this.queueName,
            bullJobId: String(existing.id),
          };
      }
      const job = await this.queue.add(this.jobName, { jobId }, options);
      this.logger.log(`queue dispatch queue=${this.queueName} jobId=${jobId} bullJobId=${job.id}`);
      return { dispatched: true, queue: this.queueName, bullJobId: String(job.id) };
    } catch (error) {
      this.logger.error(`queue dispatch failed queue=${this.queueName} jobId=${jobId}`);
      throw error;
    }
  }
}

@Injectable()
export class IngestionQueueProducer extends DurableQueueProducer {
  constructor(
    @InjectQueue(QUEUES.KB_INGESTION) queue: Queue<DurableJobPayload>,
    config: ConfigService,
  ) {
    super(queue, config, QUEUES.KB_INGESTION, QUEUE_JOB_NAMES.INGEST);
  }
}
@Injectable()
export class EmbeddingQueueProducer extends DurableQueueProducer {
  constructor(
    @InjectQueue(QUEUES.EMBEDDINGS) queue: Queue<DurableJobPayload>,
    config: ConfigService,
  ) {
    super(queue, config, QUEUES.EMBEDDINGS, QUEUE_JOB_NAMES.EMBED);
  }
}
@Injectable()
export class AiGenerationQueueProducer extends DurableQueueProducer {
  constructor(
    @InjectQueue(QUEUES.AI_GENERATION) queue: Queue<DurableJobPayload>,
    config: ConfigService,
  ) {
    super(queue, config, QUEUES.AI_GENERATION, QUEUE_JOB_NAMES.GENERATE);
  }
}
@Injectable()
export class PdfExportQueueProducer extends DurableQueueProducer {
  constructor(
    @InjectQueue(QUEUES.PDF_EXPORTS) queue: Queue<DurableJobPayload>,
    config: ConfigService,
  ) {
    super(queue, config, QUEUES.PDF_EXPORTS, QUEUE_JOB_NAMES.EXPORT_PDF);
  }
}
