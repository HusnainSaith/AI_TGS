import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileSecurityModule } from '../../infrastructure/file-security/file-security.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { ContentChunk } from './entities/content-chunk.entity';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { DocumentTopicMapping } from './entities/document-topic-mapping.entity';
import { CurriculumMappingValidator } from './curriculum-mapping-validator.service';
import { DocumentMappingsService } from './document-mappings.service';
import { KnowledgeReadinessService } from './knowledge-readiness.service';
import { PublicationPreflightService } from './publication-preflight.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { ContentChunkEmbedding } from '../embeddings/entities/content-chunk-embedding.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeDocument,
      DocumentVersion,
      IngestionJob,
      ContentChunk,
      DocumentTopicMapping,
      ContentChunkEmbedding,
    ]),
    CurriculumModule,
    AuditModule,
    StorageModule,
    FileSecurityModule,
    EmbeddingsModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [
    KnowledgeBaseService,
    CurriculumMappingValidator,
    KnowledgeReadinessService,
    PublicationPreflightService,
    DocumentMappingsService,
  ],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
