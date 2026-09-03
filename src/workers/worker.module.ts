import { Module, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { configuration } from '../config/configuration';
import { envSchema } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../infrastructure/queue/queue.module';
import { AiGenerationModule } from '../modules/ai-generation/ai-generation.module';
import { GenerationJob } from '../modules/ai-generation/entities/generation-job.entity';
import { EmbeddingJob } from '../modules/embeddings/entities/embedding-job.entity';
import { EmbeddingsModule } from '../modules/embeddings/embeddings.module';
import { IngestionJob } from '../modules/ingestion/entities/ingestion-job.entity';
import { IngestionModule } from '../modules/ingestion/ingestion.module';
import { TestExport } from '../modules/test-exports/entities/test-export.entity';
import { TestExportsModule } from '../modules/test-exports/test-exports.module';
import { User } from '../modules/users/user.entity';
import {
  AiGenerationQueueProcessor,
  EmbeddingQueueProcessor,
  IngestionQueueProcessor,
  PdfExportQueueProcessor,
} from './queue.processors';

const commonImports = [
  ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    load: [configuration],
    validationSchema: envSchema,
  }),
  DatabaseModule,
  QueueModule,
];
@Module({
  imports: [...commonImports, IngestionModule, TypeOrmModule.forFeature([IngestionJob])],
  providers: [IngestionQueueProcessor],
})
export class IngestionWorkerModule {}
@Module({
  imports: [...commonImports, EmbeddingsModule, TypeOrmModule.forFeature([EmbeddingJob])],
  providers: [EmbeddingQueueProcessor],
})
export class EmbeddingWorkerModule {}
@Module({
  imports: [...commonImports, AiGenerationModule, TypeOrmModule.forFeature([GenerationJob, User])],
  providers: [AiGenerationQueueProcessor],
})
export class AiGenerationWorkerModule {}
@Module({
  imports: [...commonImports, TestExportsModule, TypeOrmModule.forFeature([TestExport, User])],
  providers: [PdfExportQueueProcessor],
})
export class PdfExportWorkerModule {}
@Module({
  imports: [
    ...commonImports,
    IngestionModule,
    EmbeddingsModule,
    AiGenerationModule,
    TestExportsModule,
    TypeOrmModule.forFeature([IngestionJob, EmbeddingJob, GenerationJob, TestExport, User]),
  ],
  providers: [
    IngestionQueueProcessor,
    EmbeddingQueueProcessor,
    AiGenerationQueueProcessor,
    PdfExportQueueProcessor,
  ],
})
export class AllWorkersModule {}
export const WORKER_MODULES: Record<string, Type<unknown>> = {
  ingestion: IngestionWorkerModule,
  embeddings: EmbeddingWorkerModule,
  'ai-generation': AiGenerationWorkerModule,
  pdf: PdfExportWorkerModule,
  all: AllWorkersModule,
};
