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
@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeDocument, DocumentVersion, IngestionJob, ContentChunk]),
    AuditModule,
    StorageModule,
    FileSecurityModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
