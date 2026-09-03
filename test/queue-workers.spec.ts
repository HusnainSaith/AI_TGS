import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  AiGenerationQueueProducer,
  EmbeddingQueueProducer,
  IngestionQueueProducer,
  PdfExportQueueProducer,
} from '../src/infrastructure/queue/queue-producers.service';
import { QUEUE_JOB_NAMES, QUEUES } from '../src/infrastructure/queue/queue.constants';
import {
  AiGenerationQueueProcessor,
  EmbeddingQueueProcessor,
  IngestionQueueProcessor,
  PdfExportQueueProcessor,
} from '../src/workers/queue.processors';
import { GenerationJobStatus } from '../src/modules/ai-generation/generation.enums';
import { EmbeddingJobStatus } from '../src/modules/embeddings/embedding.enums';
import { IngestionJobStatus } from '../src/modules/ingestion/enums/ingestion.enums';
import { TestExportStatus } from '../src/modules/test-exports/test-export.enums';

describe('BullMQ durable producers', () => {
  const cases = [
    [IngestionQueueProducer, QUEUES.KB_INGESTION, QUEUE_JOB_NAMES.INGEST],
    [EmbeddingQueueProducer, QUEUES.EMBEDDINGS, QUEUE_JOB_NAMES.EMBED],
    [AiGenerationQueueProducer, QUEUES.AI_GENERATION, QUEUE_JOB_NAMES.GENERATE],
    [PdfExportQueueProducer, QUEUES.PDF_EXPORTS, QUEUE_JOB_NAMES.EXPORT_PDF],
  ] as const;
  it.each(cases)(
    '%p sends only a durable UUID with deterministic options',
    async (Producer, queueName, jobName) => {
      const id = randomUUID();
      const add = jest.fn().mockResolvedValue({ id });
      const queue = { add, getJob: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
      const config = {
        get: jest.fn(
          (key: string) =>
            ({ 'queue.enabled': true, 'queue.attempts': 3, 'queue.backoffMs': 250 })[key],
        ),
      } as unknown as ConfigService;
      const producer = new Producer(queue, config);
      await expect(producer.dispatch(id)).resolves.toEqual({
        dispatched: true,
        queue: queueName,
        bullJobId: id,
      });
      expect(add).toHaveBeenCalledWith(
        jobName,
        { jobId: id },
        expect.objectContaining({
          jobId: id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 250 },
        }),
      );
    },
  );
  it('does not touch Redis when queues are disabled', async () => {
    const add = jest.fn();
    const queue = { add, getJob: jest.fn() } as unknown as Queue;
    const config = { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService;
    const result = await new IngestionQueueProducer(queue, config).dispatch(randomUUID());
    expect(result.dispatched).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });
  it('rejects non-UUID payload identifiers', async () => {
    const queue = { add: jest.fn(), getJob: jest.fn() } as unknown as Queue;
    const config = { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService;
    await expect(new IngestionQueueProducer(queue, config).dispatch('bad')).rejects.toThrow('UUID');
  });
  it('treats duplicate waiting delivery as successfully dispatched', async () => {
    const id = randomUUID();
    const add = jest.fn();
    const queue = {
      add,
      getJob: jest.fn().mockResolvedValue({ id, getState: jest.fn().mockResolvedValue('waiting') }),
    } as unknown as Queue;
    const config = {
      get: jest.fn((key: string) => key === 'queue.enabled'),
    } as unknown as ConfigService;
    await expect(new IngestionQueueProducer(queue, config).dispatch(id)).resolves.toMatchObject({
      dispatched: true,
      bullJobId: id,
    });
    expect(add).not.toHaveBeenCalled();
  });
});

describe('BullMQ processors', () => {
  const bullJob = (id: string) =>
    ({ id, data: { jobId: id }, queueName: 'queue', attemptsMade: 0 }) as never;
  it('skips completed ingestion and embedding deliveries', async () => {
    const id = randomUUID();
    const ingestionService = { processJob: jest.fn() };
    const ingestion = new IngestionQueueProcessor(
      {
        findOneBy: jest.fn().mockResolvedValue({ id, status: IngestionJobStatus.AWAITING_MAPPING }),
      } as never,
      ingestionService as never,
    );
    await expect(ingestion.process(bullJob(id))).resolves.toEqual({ skipped: true });
    expect(ingestionService.processJob).not.toHaveBeenCalled();
    const embeddingService = { process: jest.fn() };
    const embedding = new EmbeddingQueueProcessor(
      {
        findOneBy: jest.fn().mockResolvedValue({ id, status: EmbeddingJobStatus.COMPLETED }),
      } as never,
      embeddingService as never,
    );
    await expect(embedding.process(bullJob(id))).resolves.toEqual({ skipped: true });
    expect(embeddingService.process).not.toHaveBeenCalled();
  });
  it('does not resurrect cancelled AI work', async () => {
    const id = randomUUID();
    const service = { process: jest.fn() };
    const processor = new AiGenerationQueueProcessor(
      {
        findOneBy: jest.fn().mockResolvedValue({
          id,
          status: GenerationJobStatus.FAILED,
          errorCode: 'AI_JOB_CANCELLED',
        }),
      } as never,
      {} as never,
      service as never,
    );
    await expect(processor.process(bullJob(id))).resolves.toEqual({ skipped: true });
    expect(service.process).not.toHaveBeenCalled();
  });
  it('reloads the PDF owner and calls the authoritative service', async () => {
    const id = randomUUID();
    const requestedBy = randomUUID();
    const service = {
      process: jest.fn().mockResolvedValue({ status: TestExportStatus.COMPLETED }),
    };
    const users = {
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: requestedBy,
        email: 'a@b.test',
        role: 'TEACHER',
        schoolId: null,
        emailVerified: true,
      }),
    };
    const processor = new PdfExportQueueProcessor(
      {
        findOneBy: jest
          .fn()
          .mockResolvedValue({ id, requestedBy, status: TestExportStatus.PENDING }),
      } as never,
      users as never,
      service as never,
    );
    await processor.process(bullJob(id));
    expect(service.process).toHaveBeenCalledWith(id, expect.objectContaining({ id: requestedBy }));
  });
});
