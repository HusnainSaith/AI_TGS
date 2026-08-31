import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_PROVIDER } from '../../infrastructure/providers/provider.contracts';
import { AuditModule } from '../audit/audit.module';
import { ContentChunk } from '../knowledge-base/entities/content-chunk.entity';
import { DocumentVersion } from '../knowledge-base/entities/document-version.entity';
import { DeterministicTestEmbeddingProvider } from './deterministic-test-embedding.provider';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingReindexService } from './embedding-reindex.service';
import { EmbeddingService } from './embedding.service';
import { EmbeddingsController } from './embeddings.controller';
import { ContentChunkEmbedding } from './entities/content-chunk-embedding.entity';
import { EmbeddingJob } from './entities/embedding-job.entity';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentChunkEmbedding, EmbeddingJob, ContentChunk, DocumentVersion]),
    AuditModule,
  ],
  controllers: [EmbeddingsController],
  providers: [
    EmbeddingConfigService,
    {
      provide: EMBEDDING_PROVIDER,
      inject: [EmbeddingConfigService, ConfigService],
      useFactory: (embeddingConfig: EmbeddingConfigService, config: ConfigService) => {
        const provider = config.get<string>('embedding.provider');
        return provider === 'test'
          ? new DeterministicTestEmbeddingProvider(embeddingConfig)
          : new OpenAIEmbeddingProvider(embeddingConfig);
      },
    },
    EmbeddingService,
    EmbeddingReindexService,
  ],
  exports: [EmbeddingConfigService, EmbeddingService, TypeOrmModule],
})
export class EmbeddingsModule {}
