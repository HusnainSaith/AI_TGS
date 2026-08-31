import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import {
  MALWARE_SCANNER_PROVIDER,
  MalwareScannerProvider,
} from '../../infrastructure/file-security/malware-scanner.provider';
import { OCR_PROVIDER, OcrProvider } from '../../infrastructure/ocr/ocr.provider';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../../infrastructure/storage/object-storage.provider';
import { AuditService } from '../audit/audit.service';
import { ContentChunk } from '../knowledge-base/entities/content-chunk.entity';
import { DocumentVersion } from '../knowledge-base/entities/document-version.entity';
import { KnowledgeDocument } from '../knowledge-base/entities/knowledge-document.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  MalwareScanStatus,
} from '../knowledge-base/enums/knowledge-base.enums';
import { IngestionJob } from './entities/ingestion-job.entity';
import { IngestionJobStatus, IngestionStep } from './enums/ingestion.enums';
import { DocxExtractorService } from './extraction/docx-extractor.service';
import { SourceExtractor } from './extraction/extraction.types';
import { PdfExtractorService } from './extraction/pdf-extractor.service';
import { TxtExtractorService } from './extraction/txt-extractor.service';
import { ChunkingService } from './processing/chunking.service';
import { CompletenessVerifierService } from './processing/completeness-verifier.service';
import { TextNormalizerService } from './processing/text-normalizer.service';

@Injectable()
export class IngestionProcessorService {
  private readonly logger = new Logger(IngestionProcessorService.name);
  constructor(
    @InjectRepository(IngestionJob) private readonly jobs: Repository<IngestionJob>,
    private readonly data: DataSource,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(MALWARE_SCANNER_PROVIDER) private readonly scanner: MalwareScannerProvider,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
    private readonly pdf: PdfExtractorService,
    private readonly docx: DocxExtractorService,
    private readonly txt: TxtExtractorService,
    private readonly normalizer: TextNormalizerService,
    private readonly chunking: ChunkingService,
    private readonly completeness: CompletenessVerifierService,
    private readonly audit: AuditService,
  ) {}
  async processJob(jobId: string, actorId?: string) {
    const token = randomUUID();
    const started = Date.now();
    const leaseMinutes = this.config.getOrThrow<number>('ingestion.staleMinutes');
    const claimed = await this.data.transaction(async (manager) => {
      const rows = await manager.query(
        `UPDATE ingestion_jobs SET status='PROCESSING', current_step='MALWARE_SCAN', started_at=COALESCE(started_at,now()), completed_at=NULL, processing_token=$2, lease_expires_at=now()+($3||' minutes')::interval, updated_at=now() WHERE id=$1 AND (status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now())) RETURNING id`,
        [jobId, token, leaseMinutes],
      );
      const claimedRow = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
      if (!claimedRow?.id) return false;
      await manager
        .getRepository(DocumentVersion)
        .createQueryBuilder()
        .update()
        .set({ extractionStatus: ExtractionStatus.PROCESSING })
        .where(`id=(SELECT document_version_id FROM ingestion_jobs WHERE id=:jobId)`, { jobId })
        .execute();
      await this.audit.record(
        { actorId, action: 'kb.ingestion.start', entityType: 'ingestion_job', entityId: jobId },
        manager,
      );
      return true;
    });
    if (!claimed) {
      if (!(await this.jobs.exist({ where: { id: jobId } })))
        throw new NotFoundException('Ingestion Job not found');
      throw new ConflictException('Ingestion Job is not available for processing');
    }
    const job = await this.jobs.findOneOrFail({
      where: { id: jobId },
      relations: { documentVersion: { document: true } },
    });
    const version = job.documentVersion;
    const document = version.document;
    this.logger.log(
      `ingestion start jobId=${jobId} documentId=${document.id} versionId=${version.id}`,
    );
    try {
      const source = await this.storage.getObject(version.storageKey).catch(() => {
        throw new Error('STORAGE_READ_FAILED');
      });
      const scan = await this.scanner.scan(source);
      let scanStatus = MalwareScanStatus.NOT_SCANNED;
      if (scan.status === 'INFECTED') {
        scanStatus = MalwareScanStatus.INFECTED;
        throw new Error('MALWARE_DETECTED');
      }
      if (scan.status === 'SCAN_FAILED') {
        scanStatus = MalwareScanStatus.FAILED;
        throw new Error('MALWARE_SCAN_FAILED');
      }
      if (scan.status === 'CLEAN') scanStatus = MalwareScanStatus.CLEAN;
      if (
        scan.status === 'NOT_CONFIGURED' &&
        !this.config.getOrThrow<boolean>('ingestion.allowUnscannedProcessing')
      )
        throw new Error('MALWARE_SCANNER_NOT_CONFIGURED');
      await this.updateStep(jobId, token, IngestionStep.TEXT_EXTRACTION, {
        malwareScan: scan.status,
        scannerProvider: scan.provider,
      });
      let extraction = await this.extractor(document.sourceType).extract(source);
      let ocrUsed = false;
      if (extraction.ocrRequired) {
        await this.updateStep(jobId, token, IngestionStep.OCR, { ocrRequired: true });
        if (!this.ocr.available) throw new Error('OCR_PROVIDER_NOT_CONFIGURED');
        const pages = await this.ocr.extractPdf(source);
        extraction = {
          blocks: pages.map((page) => ({
            text: page.text,
            locator: { type: 'PDF_PAGE', pageFrom: page.pageNumber, pageTo: page.pageNumber },
          })),
          pageCount: pages.length,
          emptyPageCount: pages.filter((p) => !p.text.trim()).length,
          ocrRequired: true,
          warnings: [],
        };
        ocrUsed = true;
      }
      await this.updateStep(jobId, token, IngestionStep.NORMALIZATION);
      const blocks = extraction.blocks
        .map((block) => ({ ...block, text: this.normalizer.normalize(block.text) }))
        .filter((block) => block.text);
      const normalizedCharacters = blocks.reduce((sum, b) => sum + b.text.length, 0);
      await this.updateStep(jobId, token, IngestionStep.CHUNKING);
      const chunks = this.chunking.chunk(blocks);
      await this.updateStep(jobId, token, IngestionStep.VERIFICATION);
      this.completeness.verify(normalizedCharacters, chunks);
      const metrics = {
        sourceType: document.sourceType,
        fileSize: version.fileSize,
        pageCount: extraction.pageCount ?? null,
        extractedCharacters: extraction.blocks.reduce((sum, b) => sum + b.text.length, 0),
        normalizedCharacters,
        chunkCount: chunks.length,
        estimatedTokens: chunks.reduce((sum, c) => sum + c.estimatedTokenCount, 0),
        emptyPageCount: extraction.emptyPageCount,
        ocrRequired: extraction.ocrRequired,
        ocrUsed,
        malwareScan: scan.status,
        scannerProvider: scan.provider,
        processingDurationMs: Date.now() - started,
        warnings: extraction.warnings.slice(0, 20),
        queueDispatched: false,
      };
      await this.data.transaction(async (manager) => {
        const owned = await manager.getRepository(IngestionJob).exist({
          where: { id: jobId, processingToken: token, status: IngestionJobStatus.PROCESSING },
        });
        if (!owned) throw new ConflictException('Ingestion processing lease was lost');
        await manager.getRepository(ContentChunk).delete({ documentVersionId: version.id });
        await manager.getRepository(ContentChunk).insert(
          chunks.map((chunk) => ({
            ...chunk,
            documentVersionId: version.id,
            tenantScope: document.tenantScope,
            schoolId: document.schoolId,
            boardId: null,
            classId: null,
            subjectId: null,
            chapterId: null,
            topicId: null,
          })),
        );
        await manager.getRepository(DocumentVersion).update(version.id, {
          extractionStatus: ExtractionStatus.COMPLETED,
          malwareScanStatus: scanStatus,
          pageCount: extraction.pageCount ?? null,
        });
        await manager
          .getRepository(KnowledgeDocument)
          .update(document.id, { status: KnowledgeDocumentStatus.READY_FOR_MAPPING });
        await manager.getRepository(IngestionJob).update(
          { id: jobId, processingToken: token },
          {
            status: IngestionJobStatus.AWAITING_MAPPING,
            currentStep: IngestionStep.READY_FOR_MAPPING,
            metrics: () => `'${JSON.stringify(metrics).replaceAll("'", "''")}'::jsonb`,
            completedAt: new Date(),
            processingToken: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        );
        await this.audit.record(
          {
            actorId,
            action: 'kb.ingestion.complete',
            entityType: 'ingestion_job',
            entityId: jobId,
            metadata: {
              documentId: document.id,
              versionId: version.id,
              sourceType: document.sourceType,
              chunkCount: chunks.length,
              durationMs: metrics.processingDurationMs,
            },
          },
          manager,
        );
      });
      this.logger.log(`ingestion ready-for-mapping jobId=${jobId} chunks=${chunks.length}`);
      return {
        jobId,
        status: IngestionJobStatus.AWAITING_MAPPING,
        currentStep: IngestionStep.READY_FOR_MAPPING,
        metrics,
      };
    } catch (error) {
      const code = this.failureCode(error);
      await this.fail(jobId, token, version, document, code, actorId, Date.now() - started);
      this.logger.warn(`ingestion failed jobId=${jobId} code=${code}`);
      return { jobId, status: IngestionJobStatus.FAILED, errorCode: code };
    }
  }
  private extractor(type: KnowledgeSourceType): SourceExtractor {
    if (type === KnowledgeSourceType.PDF) return this.pdf;
    if (type === KnowledgeSourceType.DOCX) return this.docx;
    if (type === KnowledgeSourceType.TXT) return this.txt;
    throw new Error('UNSUPPORTED_SOURCE_TYPE');
  }
  private async updateStep(
    id: string,
    token: string,
    step: IngestionStep,
    metrics?: Record<string, unknown>,
  ) {
    const result = await this.jobs
      .createQueryBuilder()
      .update()
      .set({
        currentStep: step,
        ...(metrics && {
          metrics: () => `metrics || '${JSON.stringify(metrics).replaceAll("'", "''")}'::jsonb`,
        }),
      })
      .where('id=:id AND processingToken=:token AND status=:status', {
        id,
        token,
        status: IngestionJobStatus.PROCESSING,
      })
      .execute();
    if (!result.affected) throw new ConflictException('Ingestion processing lease was lost');
  }
  private failureCode(error: unknown) {
    const code = error instanceof Error ? error.message : 'INGESTION_FAILED';
    const allowed = new Set([
      'MALWARE_DETECTED',
      'MALWARE_SCAN_FAILED',
      'MALWARE_SCANNER_NOT_CONFIGURED',
      'OCR_REQUIRED',
      'OCR_PROVIDER_NOT_CONFIGURED',
      'PDF_EXTRACTION_FAILED',
      'DOCX_EXTRACTION_FAILED',
      'TXT_EXTRACTION_FAILED',
      'EMPTY_DOCUMENT',
      'NORMALIZATION_FAILED',
      'CHUNKING_FAILED',
      'COMPLETENESS_CHECK_FAILED',
      'STORAGE_READ_FAILED',
      'UNSUPPORTED_SOURCE_TYPE',
    ]);
    return allowed.has(code) ? code : 'INGESTION_FAILED';
  }
  private async fail(
    jobId: string,
    token: string,
    version: DocumentVersion,
    document: KnowledgeDocument,
    code: string,
    actorId: string | undefined,
    duration: number,
  ) {
    await this.data.transaction(async (manager) => {
      await manager.getRepository(ContentChunk).delete({ documentVersionId: version.id });
      await manager.getRepository(DocumentVersion).update(version.id, {
        extractionStatus: ExtractionStatus.FAILED,
        ...(code === 'MALWARE_DETECTED' && { malwareScanStatus: MalwareScanStatus.INFECTED }),
        ...(code === 'MALWARE_SCAN_FAILED' && { malwareScanStatus: MalwareScanStatus.FAILED }),
      });
      await manager
        .getRepository(KnowledgeDocument)
        .update(document.id, { status: KnowledgeDocumentStatus.FAILED });
      await manager.getRepository(IngestionJob).update(
        { id: jobId, processingToken: token },
        {
          status: IngestionJobStatus.FAILED,
          errorCode: code,
          errorMessage: this.safeMessage(code),
          completedAt: new Date(),
          processingToken: null,
          leaseExpiresAt: null,
          metrics: { ...version.ingestionJobs?.[0]?.metrics, processingDurationMs: duration },
        },
      );
      await this.audit.record(
        {
          actorId,
          action: 'kb.ingestion.fail',
          entityType: 'ingestion_job',
          entityId: jobId,
          metadata: {
            documentId: document.id,
            versionId: version.id,
            sourceType: document.sourceType,
            errorCode: code,
            durationMs: duration,
          },
          outcome: 'FAILED',
        },
        manager,
      );
    });
  }
  private safeMessage(code: string) {
    const messages: Record<string, string> = {
      MALWARE_DETECTED: 'The source failed malware screening',
      MALWARE_SCAN_FAILED: 'Malware scanning failed',
      MALWARE_SCANNER_NOT_CONFIGURED: 'A malware scanner is not configured',
      OCR_PROVIDER_NOT_CONFIGURED: 'OCR is required but no OCR provider is configured',
      PDF_EXTRACTION_FAILED: 'PDF extraction failed',
      DOCX_EXTRACTION_FAILED: 'DOCX extraction failed',
      TXT_EXTRACTION_FAILED: 'TXT extraction failed',
      EMPTY_DOCUMENT: 'The document contains no extractable content',
      COMPLETENESS_CHECK_FAILED: 'Extracted content did not pass completeness verification',
      STORAGE_READ_FAILED: 'The quarantined source could not be read',
    };
    return messages[code] ?? 'Ingestion processing failed';
  }
}
