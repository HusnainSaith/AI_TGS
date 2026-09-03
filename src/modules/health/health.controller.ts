import { Controller, Get, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DurableJobPayload, QUEUES } from '../../infrastructure/queue/queue.constants';
import { Public } from '../../common/decorators/public.decorator';
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional()
    @InjectQueue(QUEUES.AI_GENERATION)
    private readonly queue?: Queue<DurableJobPayload>,
  ) {}
  @Public() @Get('live') live() {
    return { status: 'ok', application: 'up', timestamp: new Date().toISOString() };
  }
  @Public() @Get() async check() {
    let database: 'up' | 'down' = 'down';
    let pgvector: { status: 'up' | 'down'; version: string | null } = {
      status: 'down',
      version: null,
    };
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
      const rows = await this.dataSource.query(
        `SELECT extversion FROM pg_extension WHERE extname='vector'`,
      );
      if (rows[0]?.extversion) pgvector = { status: 'up', version: String(rows[0].extversion) };
    } catch {
      database = 'down';
    }
    const queuesEnabled = this.config.get<boolean>('queue.enabled') ?? false;
    let redis: 'up' | 'down' | 'disabled' = queuesEnabled ? 'down' : 'disabled';
    if (queuesEnabled && this.queue) {
      try {
        await Promise.race([
          this.queue.getJobCounts('wait', 'active', 'failed'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
        ]);
        redis = 'up';
      } catch {
        redis = 'down';
      }
    }
    return {
      status: database === 'up' && (!queuesEnabled || redis === 'up') ? 'ok' : 'degraded',
      application: 'up',
      database,
      redis,
      queues: { enabled: queuesEnabled, status: redis },
      pgvector,
      embeddingProvider: {
        provider: this.config.get<string>('embedding.provider') ?? null,
        model: this.config.get<string>('embedding.model') ?? null,
        dimension: this.config.get<number>('embedding.dimension') ?? null,
        configured:
          this.config.get<string>('embedding.provider') === 'test' ||
          Boolean(this.config.get<string>('embedding.apiKey')),
      },
      aiGenerationProvider: {
        provider: this.config.get<string>('aiGeneration.provider') ?? null,
        model: this.config.get<string>('aiGeneration.model') || null,
        configured:
          this.config.get<string>('aiGeneration.provider') === 'test' ||
          Boolean(
            this.config.get<string>('aiGeneration.model') &&
            this.config.get<string>('aiGeneration.apiKey'),
          ),
      },
      emailProvider: {
        provider: this.config.get<string>('email.provider') || null,
        configured:
          this.config.get<string>('email.provider') === 'smtp' &&
          Boolean(
            this.config.get<string>('email.smtp.host') &&
            this.config.get<string>('email.fromEmail'),
          ),
      },
      ocrProvider: {
        provider: this.config.get<string>('ingestion.ocrProvider') ?? 'none',
        configured: this.config.get<string>('ingestion.ocrProvider') !== 'none',
      },
      malwareScanner: {
        provider: this.config.get<string>('ingestion.malwareScannerProvider') ?? 'none',
        configured: this.config.get<string>('ingestion.malwareScannerProvider') !== 'none',
      },
      billingProvider: {
        provider: this.config.get<string>('billing.provider') || null,
        configured:
          this.config.get<string>('billing.provider') === 'test' ||
          (this.config.get<string>('billing.provider') === 'safepay' &&
            Boolean(
              this.config.get<string>('billing.safepay.publicKey') &&
              this.config.get<string>('billing.safepay.secretKey') &&
              this.config.get<string>('billing.safepay.webhookSecret'),
            )),
        productionProviderSelected:
          Boolean(this.config.get<string>('billing.provider')) &&
          this.config.get<string>('billing.provider') !== 'test',
        environment:
          this.config.get<string>('billing.provider') === 'safepay'
            ? this.config.get<string>('billing.safepay.environment')
            : null,
        capabilities:
          this.config.get<string>('billing.provider') === 'safepay'
            ? {
                checkout: 'SUPPORTED',
                customerCreation: 'UNSUPPORTED',
                portal: 'UNSUPPORTED',
                cancellation: 'SUPPORTED',
                planChange: 'UNSUPPORTED',
                subscriptionRetrieval: 'SUPPORTED',
                reconciliation: 'SUPPORTED',
              }
            : null,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
