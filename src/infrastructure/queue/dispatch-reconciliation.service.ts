import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  AiGenerationQueueProducer,
  EmbeddingQueueProducer,
  IngestionQueueProducer,
  PdfExportQueueProducer,
} from './queue-producers.service';

@Injectable()
export class DispatchReconciliationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DispatchReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly data: DataSource,
    private readonly config: ConfigService,
    private readonly ingestion: IngestionQueueProducer,
    private readonly embeddings: EmbeddingQueueProducer,
    private readonly generation: AiGenerationQueueProducer,
    private readonly pdf: PdfExportQueueProducer,
  ) {}
  onApplicationBootstrap() {
    if (!this.config.get<boolean>('queue.enabled')) return;
    void this.reconcile();
    this.timer = setInterval(
      () => void this.reconcile(),
      this.config.get<number>('queue.reconciliationIntervalMs') ?? 30000,
    );
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const queries: Array<[string, string, { dispatch(id: string): Promise<unknown> }]> = [
        [
          'ingestion_jobs',
          `status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now())`,
          this.ingestion,
        ],
        [
          'embedding_jobs',
          `status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now())`,
          this.embeddings,
        ],
        [
          'generation_jobs',
          `status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now())`,
          this.generation,
        ],
        [
          'test_exports',
          `status='PENDING' OR (status='PROCESSING' AND lease_expires_at<now())`,
          this.pdf,
        ],
      ];
      for (const [table, predicate, producer] of queries) {
        const rows = await this.data.query(
          `SELECT id FROM ${table} WHERE ${predicate} ORDER BY created_at ASC LIMIT 100`,
        );
        for (const row of rows as Array<{ id: string }>)
          await producer.dispatch(row.id).catch(() => undefined);
      }
    } catch {
      this.logger.warn('queue reconciliation failed; durable jobs remain recoverable');
    } finally {
      this.running = false;
    }
  }
}
