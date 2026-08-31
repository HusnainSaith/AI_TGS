import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../../infrastructure/providers/provider.contracts';
import { AuditService } from '../audit/audit.service';
import { ContentChunk } from '../knowledge-base/entities/content-chunk.entity';
import { DocumentVersion } from '../knowledge-base/entities/document-version.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  MalwareScanStatus,
  TenantScope,
} from '../knowledge-base/enums/knowledge-base.enums';
import { EmbeddingConfigService } from './embedding-config.service';
import { EmbeddingErrorCode, EmbeddingJobStatus, EmbeddingStatus } from './embedding.enums';
import { EmbeddingProviderError } from './embedding-provider.error';
import { ContentChunkEmbedding } from './entities/content-chunk-embedding.entity';
import { EmbeddingJob } from './entities/embedding-job.entity';

@Injectable()
export class EmbeddingService {
  constructor(
    @InjectRepository(EmbeddingJob) private readonly jobs: Repository<EmbeddingJob>,
    @InjectRepository(ContentChunkEmbedding)
    private readonly embeddings: Repository<ContentChunkEmbedding>,
    @InjectRepository(DocumentVersion) private readonly versions: Repository<DocumentVersion>,
    @InjectRepository(ContentChunk) private readonly chunks: Repository<ContentChunk>,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly config: EmbeddingConfigService,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}

  private async version(id: string, user: AuthenticatedUser, mutate: boolean) {
    const qb = this.versions
      .createQueryBuilder('version')
      .innerJoinAndSelect('version.document', 'document')
      .where('version.id=:id', { id });
    if (user.role !== UserRole.SYSTEM_ADMIN)
      qb.andWhere(
        '(document.tenantScope=:global OR (document.tenantScope=:school AND document.schoolId=:schoolId))',
        {
          global: TenantScope.GLOBAL,
          school: TenantScope.SCHOOL,
          schoolId: user.schoolId ?? '00000000-0000-0000-0000-000000000000',
        },
      );
    const version = await qb.getOne();
    if (!version) {
      if (await this.versions.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to access this Document Version');
      throw new NotFoundException('Document Version not found');
    }
    if (
      mutate &&
      user.role !== UserRole.SYSTEM_ADMIN &&
      (user.role !== UserRole.SCHOOL_ADMIN ||
        version.document.tenantScope !== TenantScope.SCHOOL ||
        version.document.schoolId !== user.schoolId)
    )
      throw new ForbiddenException(
        'You do not have permission to manage embeddings for this version',
      );
    return version;
  }

  private assertEligible(version: DocumentVersion, count: number) {
    if (version.document.status === KnowledgeDocumentStatus.ARCHIVED || version.archivedAt)
      throw new ConflictException('Archived content cannot be embedded');
    if (version.malwareScanStatus !== MalwareScanStatus.CLEAN)
      throw new ConflictException(
        version.malwareScanStatus === MalwareScanStatus.INFECTED
          ? 'Malware-detected content cannot be embedded'
          : 'A successful CLEAN malware scan is required before embedding',
      );
    if (version.extractionStatus !== ExtractionStatus.COMPLETED)
      throw new ConflictException('Completed extraction is required before embedding');
    if (!count) throw new ConflictException('At least one valid content chunk is required');
  }

  async createAndProcess(versionId: string, user: AuthenticatedUser, reindex = false) {
    const version = await this.version(versionId, user, true);
    const chunks = await this.chunks.find({
      where: { documentVersionId: versionId },
      order: { chunkOrder: 'ASC' },
    });
    this.assertEligible(version, chunks.length);
    const active = this.config.active();
    if (!active.configured) throw new ConflictException(EmbeddingErrorCode.PROVIDER_NOT_CONFIGURED);
    const job = await this.data.transaction(async (manager) => {
      if (reindex)
        await manager.query(
          `UPDATE content_chunk_embeddings e SET status='STALE', updated_at=now() FROM content_chunks c
           WHERE e.content_chunk_id=c.id AND c.document_version_id=$1 AND e.embedding_config_version=$2
           AND (e.content_hash<>c.content_hash OR e.status IN ('FAILED','STALE'))`,
          [versionId, active.configVersion],
        );
      const saved = await manager.getRepository(EmbeddingJob).save({
        documentVersionId: versionId,
        provider: active.provider,
        model: active.model,
        dimension: active.dimension,
        configVersion: active.configVersion,
        status: EmbeddingJobStatus.QUEUED,
        totalChunks: chunks.length,
        metrics: { reindex, batches: 0, durationMs: 0 },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: reindex ? 'kb.embedding.reindex.requested' : 'kb.embedding.job.create',
          entityType: 'embedding_job',
          entityId: saved.id,
          metadata: { documentVersionId: versionId, configVersion: active.configVersion },
        },
        manager,
      );
      return saved;
    });
    return this.process(job.id, user.id);
  }

  async process(jobId: string, actorId?: string) {
    const token = randomUUID();
    const started = Date.now();
    const claimed = await this.data.query(
      `UPDATE embedding_jobs SET status='PROCESSING', processing_token=$2, started_at=COALESCE(started_at,now()),
       completed_at=NULL, lease_expires_at=now()+($3||' minutes')::interval, updated_at=now()
       WHERE id=$1 AND (status='QUEUED' OR (status='PROCESSING' AND lease_expires_at<now())) RETURNING *`,
      [jobId, token, this.config.staleMinutes()],
    );
    if (!claimed[0]) throw new ConflictException('Embedding Job is not available for processing');
    const job = await this.jobs.findOneOrFail({ where: { id: jobId } });
    const active = this.config.active();
    if (job.configVersion !== active.configVersion)
      throw new ConflictException('Embedding Job configuration is no longer active');
    await this.audit.record({
      actorId,
      action: 'kb.embedding.start',
      entityType: 'embedding_job',
      entityId: jobId,
    });
    const chunks = await this.chunks.find({
      where: { documentVersionId: job.documentVersionId },
      order: { chunkOrder: 'ASC' },
    });
    const existing = await this.embeddings
      .createQueryBuilder('embedding')
      .innerJoin('embedding.contentChunk', 'chunk')
      .where('embedding.embeddingConfigVersion=:configVersion', {
        configVersion: active.configVersion,
      })
      .andWhere('chunk.documentVersionId=:documentVersionId', {
        documentVersionId: job.documentVersionId,
      })
      .getMany();
    const byChunk = new Map(existing.map((item) => [item.contentChunkId, item]));
    const pending = chunks.filter((chunk) => {
      const value = byChunk.get(chunk.id);
      return !(
        value?.status === EmbeddingStatus.COMPLETED &&
        value.contentHash === chunk.contentHash &&
        value.dimension === active.dimension
      );
    });
    const skipped = chunks.length - pending.length;
    let embedded = 0;
    let failed = 0;
    let requests = 0;
    let inputTokens = 0;
    let batches = 0;
    for (let offset = 0; offset < pending.length; offset += this.config.batchSize()) {
      const batch = pending.slice(offset, offset + this.config.batchSize());
      batches += 1;
      try {
        const results = await this.provider.embedBatch(batch.map((chunk) => chunk.content));
        requests += 1;
        if (results.length !== batch.length)
          throw new EmbeddingProviderError(
            EmbeddingErrorCode.RESPONSE_MISMATCH,
            'Embedding provider response count mismatch',
          );
        await this.data.transaction(async (manager) => {
          for (let index = 0; index < batch.length; index += 1) {
            const chunk = batch[index]!;
            const result = results[index]!;
            if (result.vector.length !== active.dimension)
              throw new EmbeddingProviderError(
                EmbeddingErrorCode.DIMENSION_MISMATCH,
                'Embedding provider response dimension mismatch',
              );
            inputTokens += result.usage?.inputTokens ?? 0;
            const vector = `[${result.vector.join(',')}]`;
            await manager.query(
              `INSERT INTO content_chunk_embeddings
               (content_chunk_id,provider,model,model_version,embedding_config_version,dimension,distance_metric,content_hash,status,embedding,embedded_at,error_code,usage_metadata)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',$9::vector,now(),NULL,$10::jsonb)
               ON CONFLICT (content_chunk_id,embedding_config_version) DO UPDATE SET
               provider=EXCLUDED.provider,model=EXCLUDED.model,model_version=EXCLUDED.model_version,dimension=EXCLUDED.dimension,
               distance_metric=EXCLUDED.distance_metric,content_hash=EXCLUDED.content_hash,status='COMPLETED',embedding=EXCLUDED.embedding,
               embedded_at=now(),error_code=NULL,usage_metadata=EXCLUDED.usage_metadata,updated_at=now()`,
              [
                chunk.id,
                active.provider,
                active.model,
                result.version ?? null,
                active.configVersion,
                active.dimension,
                active.distanceMetric,
                chunk.contentHash,
                vector,
                JSON.stringify({
                  usage: result.usage ?? null,
                  requestId: result.providerRequestId ?? null,
                  latencyMs: result.latencyMs,
                }),
              ],
            );
          }
        });
        embedded += batch.length;
        await this.audit.record({
          actorId,
          action: 'kb.embedding.batch.complete',
          entityType: 'embedding_job',
          entityId: jobId,
          metadata: { batchSize: batch.length },
        });
      } catch (error) {
        const code =
          error instanceof EmbeddingProviderError ? error.code : EmbeddingErrorCode.PROVIDER_ERROR;
        failed += batch.length;
        for (const chunk of batch)
          await this.data.query(
            `INSERT INTO content_chunk_embeddings
             (content_chunk_id,provider,model,embedding_config_version,dimension,distance_metric,content_hash,status,error_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'FAILED',$8)
             ON CONFLICT (content_chunk_id,embedding_config_version) DO UPDATE SET status='FAILED',embedding=NULL,embedded_at=NULL,error_code=EXCLUDED.error_code,content_hash=EXCLUDED.content_hash,updated_at=now()`,
            [
              chunk.id,
              active.provider,
              active.model,
              active.configVersion,
              active.dimension,
              active.distanceMetric,
              chunk.contentHash,
              code,
            ],
          );
      }
    }
    const status = failed
      ? embedded || skipped
        ? EmbeddingJobStatus.PARTIAL
        : EmbeddingJobStatus.FAILED
      : EmbeddingJobStatus.COMPLETED;
    const action =
      status === EmbeddingJobStatus.COMPLETED
        ? 'kb.embedding.complete'
        : status === EmbeddingJobStatus.PARTIAL
          ? 'kb.embedding.partial'
          : 'kb.embedding.failed';
    await this.data.transaction(async (manager) => {
      await manager.getRepository(EmbeddingJob).update(
        { id: jobId, processingToken: token },
        {
          status,
          processedChunks: embedded + failed + skipped,
          embeddedChunks: embedded,
          failedChunks: failed,
          skippedChunks: skipped,
          inputTokens: inputTokens || null,
          requestCount: requests,
          processingToken: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
          errorCode: failed ? EmbeddingErrorCode.PROVIDER_ERROR : null,
          metrics: { batches, durationMs: Date.now() - started },
        },
      );
      await this.audit.record(
        {
          actorId,
          action,
          entityType: 'embedding_job',
          entityId: jobId,
          metadata: { embedded, failed, skipped, batches, durationMs: Date.now() - started },
        },
        manager,
      );
    });
    return this.jobResponse(await this.jobs.findOneByOrFail({ id: jobId }));
  }

  async status(versionId: string, user: AuthenticatedUser) {
    await this.version(versionId, user, false);
    const active = this.config.active();
    const rows = await this.data.query(
      `SELECT count(*) FILTER (WHERE e.status='COMPLETED' AND e.content_hash=c.content_hash AND e.dimension=$3)::int AS embedded,
       count(*) FILTER (WHERE e.status='FAILED')::int AS failed,
       count(*) FILTER (WHERE e.status='STALE' OR (e.id IS NOT NULL AND e.content_hash<>c.content_hash))::int AS stale,
       count(*)::int AS total, max(e.embedded_at) AS last_embedded_at
       FROM content_chunks c LEFT JOIN content_chunk_embeddings e ON e.content_chunk_id=c.id AND e.embedding_config_version=$2
       WHERE c.document_version_id=$1`,
      [versionId, active.configVersion, active.dimension],
    );
    const latest = await this.jobs.findOne({
      where: { documentVersionId: versionId },
      order: { createdAt: 'DESC' },
    });
    const summary = rows[0] ?? {};
    return {
      job: latest ? this.jobResponse(latest) : null,
      provider: active.provider,
      model: active.model,
      dimension: active.dimension,
      configVersion: active.configVersion,
      totalChunks: Number(summary.total ?? 0),
      embeddedChunks: Number(summary.embedded ?? 0),
      failedChunks: Number(summary.failed ?? 0),
      staleChunks: Number(summary.stale ?? 0),
      skippedChunks: latest?.skippedChunks ?? 0,
      lastEmbeddedAt: summary.last_embedded_at ?? null,
    };
  }

  async retry(jobId: string, user: AuthenticatedUser) {
    const job = await this.jobs.findOne({
      where: { id: jobId },
      relations: { documentVersion: { document: true } },
    });
    if (!job) throw new NotFoundException('Embedding Job not found');
    await this.version(job.documentVersionId, user, true);
    if (![EmbeddingJobStatus.FAILED, EmbeddingJobStatus.PARTIAL].includes(job.status))
      throw new ConflictException('Only failed or partial embedding jobs may be retried');
    if (job.retryCount >= 3) throw new ConflictException('Maximum embedding retry count reached');
    await this.jobs.update(jobId, {
      status: EmbeddingJobStatus.QUEUED,
      retryCount: job.retryCount + 1,
      errorCode: null,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'kb.embedding.retry',
      entityType: 'embedding_job',
      entityId: jobId,
      metadata: { retryCount: job.retryCount + 1 },
    });
    return this.process(jobId, user.id);
  }

  private jobResponse(job: EmbeddingJob) {
    const safe: Partial<EmbeddingJob> = { ...job };
    delete safe.processingToken;
    return safe;
  }
}
