import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { IngestionJob } from './entities/ingestion-job.entity';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IngestionProcessorService } from './ingestion-processor.service';
import { ContentChunk } from '../knowledge-base/entities/content-chunk.entity';
import { DocumentVersion } from '../knowledge-base/entities/document-version.entity';
import { KnowledgeDocument } from '../knowledge-base/entities/knowledge-document.entity';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { FileSecurityModule } from '../../infrastructure/file-security/file-security.module';
import { OcrModule } from '../../infrastructure/ocr/ocr.module';
import { PdfExtractorService } from './extraction/pdf-extractor.service';
import { DocxExtractorService } from './extraction/docx-extractor.service';
import { TxtExtractorService } from './extraction/txt-extractor.service';
import { TextNormalizerService } from './processing/text-normalizer.service';
import { TokenEstimatorService } from './processing/token-estimator.service';
import { ChunkingService } from './processing/chunking.service';
import { CompletenessVerifierService } from './processing/completeness-verifier.service';
import { MalwareScanningService } from './malware-scanning.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([IngestionJob, ContentChunk, DocumentVersion, KnowledgeDocument]),
    AuditModule,
    StorageModule,
    FileSecurityModule,
    OcrModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionProcessorService,
    PdfExtractorService,
    DocxExtractorService,
    TxtExtractorService,
    TextNormalizerService,
    TokenEstimatorService,
    ChunkingService,
    CompletenessVerifierService,
    MalwareScanningService,
  ],
  exports: [IngestionService, IngestionProcessorService, MalwareScanningService],
})
export class IngestionModule {}
