import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from './queue.constants';
import {
  AiGenerationQueueProducer,
  EmbeddingQueueProducer,
  IngestionQueueProducer,
  PdfExportQueueProducer,
} from './queue-producers.service';
import { DispatchReconciliationService } from './dispatch-reconciliation.service';
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const configuredUrl = c.get<string>('redis.url');
        const parsed = configuredUrl ? new URL(configuredUrl) : null;
        return {
          connection: {
            host: parsed?.hostname || c.getOrThrow<string>('redis.host'),
            port: parsed?.port ? Number(parsed.port) : c.getOrThrow<number>('redis.port'),
            username: parsed?.username
              ? decodeURIComponent(parsed.username)
              : c.get<string>('redis.username') || undefined,
            password: parsed?.password
              ? decodeURIComponent(parsed.password)
              : c.get<string>('redis.password') || undefined,
            db:
              parsed?.pathname && parsed.pathname !== '/'
                ? Number(parsed.pathname.slice(1))
                : (c.get<number>('redis.db') ?? 0),
            tls: parsed?.protocol === 'rediss:' || c.get<boolean>('redis.tls') ? {} : undefined,
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
          prefix: c.get<string>('queue.prefix') ?? 'tgs',
        };
      },
    }),
    BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name }))),
  ],
  providers: [
    IngestionQueueProducer,
    EmbeddingQueueProducer,
    AiGenerationQueueProducer,
    PdfExportQueueProducer,
    DispatchReconciliationService,
  ],
  exports: [
    BullModule,
    IngestionQueueProducer,
    EmbeddingQueueProducer,
    AiGenerationQueueProducer,
    PdfExportQueueProducer,
    DispatchReconciliationService,
  ],
})
export class QueueModule {}
