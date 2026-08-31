import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../../infrastructure/providers/provider.contracts';
import { AuditService } from '../audit/audit.service';
import { CurriculumMappingValidator } from '../knowledge-base/curriculum-mapping-validator.service';
import { EmbeddingConfigService } from '../embeddings/embedding-config.service';
import { TenantScope } from '../knowledge-base/enums/knowledge-base.enums';
import { ContextPackingService, RankedEvidence } from './context-packing.service';
import { RetrievalPreviewDto } from './dto/retrieval.dto';
import { RetrievalEvent } from './entities/retrieval-event.entity';
import { RetrievalEventChunk } from './entities/retrieval-event-chunk.entity';
import { RetrievalEventStatus } from './retrieval.enums';
interface CandidateRow {
  content_chunk_id: string;
  document_version_id: string;
  document_id: string;
  chunk_order: number;
  content: string;
  content_hash: string;
  estimated_tokens: number;
  locator: Record<string, unknown>;
  vector_score: number | string;
  keyword_score: number | string;
  hybrid_score: number | string;
}
@Injectable()
export class RetrievalService {
  constructor(
    private readonly data: DataSource,
    @InjectRepository(RetrievalEvent) private readonly events: Repository<RetrievalEvent>,
    private readonly config: ConfigService,
    private readonly embeddingConfig: EmbeddingConfigService,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly validator: CurriculumMappingValidator,
    private readonly packer: ContextPackingService,
    private readonly audit: AuditService,
  ) {}
  async preview(dto: RetrievalPreviewDto, user: AuthenticatedUser) {
    await this.validator.validate(dto);
    const settings = this.settings(dto);
    const active = this.embeddingConfig.active();
    if (!active.configured) throw new ConflictException('EMBEDDING_PROVIDER_NOT_CONFIGURED');
    const started = Date.now();
    const event = await this.events.save({
      requestedBy: user.id,
      queryText: dto.queryText,
      filters: this.filters(dto, user),
      strategyVersion: settings.strategyVersion,
      embeddingConfigVersion: active.configVersion,
      topK: settings.topK,
      minSimilarity: settings.minSimilarity,
      vectorWeight: settings.vectorWeight,
      keywordWeight: settings.keywordWeight,
      contextBudgetTokens: settings.contextBudget,
      status: RetrievalEventStatus.STARTED,
      candidateCount: 0,
      resultCount: 0,
      latencyMs: null,
      failureCode: null,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'kb.retrieval.start',
      entityType: 'retrieval_event',
      entityId: event.id,
      metadata: { strategyVersion: settings.strategyVersion },
    });
    try {
      const result = await this.provider.embed(dto.queryText);
      if (result.vector.length !== active.dimension)
        throw new Error('EMBEDDING_DIMENSION_MISMATCH');
      const rows = await this.query(result.vector, dto, user, active.configVersion, settings);
      const candidates = rows.map((row) => this.candidate(row));
      const evidence = this.packer.pack(candidates, settings.contextBudget, settings.topK);
      const status = evidence.length
        ? RetrievalEventStatus.COMPLETED
        : RetrievalEventStatus.INSUFFICIENT_KNOWLEDGE;
      const latency = Date.now() - started;
      await this.data.transaction(async (manager) => {
        if (evidence.length)
          await manager.getRepository(RetrievalEventChunk).save(
            evidence.map((item) =>
              manager.getRepository(RetrievalEventChunk).create({
                retrievalEventId: event.id,
                contentChunkId: item.contentChunkId,
                documentVersionId: item.documentVersionId,
                label: item.label,
                rank: item.rank,
                vectorScore: item.vectorScore,
                keywordScore: item.keywordScore,
                hybridScore: item.hybridScore,
                estimatedTokens: item.estimatedTokens,
                contentHash: item.contentHash,
                locatorSnapshot: item.locator,
              }),
            ),
          );
        await manager.getRepository(RetrievalEvent).update(event.id, {
          status,
          candidateCount: candidates.length,
          resultCount: evidence.length,
          latencyMs: latency,
        });
        await this.audit.record(
          {
            actorId: user.id,
            action:
              status === RetrievalEventStatus.COMPLETED
                ? 'kb.retrieval.complete'
                : 'kb.retrieval.insufficient',
            entityType: 'retrieval_event',
            entityId: event.id,
            metadata: {
              candidateCount: candidates.length,
              resultCount: evidence.length,
              latencyMs: latency,
            },
          },
          manager,
        );
      });
      return {
        retrievalEventId: event.id,
        status,
        strategyVersion: settings.strategyVersion,
        candidateCount: candidates.length,
        selectedCount: evidence.length,
        contextTokenEstimate: evidence.reduce((sum, item) => sum + item.estimatedTokens, 0),
        evidence,
      };
    } catch (error) {
      await this.events.update(event.id, {
        status: RetrievalEventStatus.FAILED,
        latencyMs: Date.now() - started,
        failureCode: this.failure(error),
      });
      await this.audit.record({
        actorId: user.id,
        action: 'kb.retrieval.failed',
        entityType: 'retrieval_event',
        entityId: event.id,
        metadata: { failureCode: this.failure(error) },
        outcome: 'FAILED',
      });
      throw error;
    }
  }
  async findEvent(id: string, user: AuthenticatedUser) {
    const qb = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.chunks', 'selected')
      .leftJoinAndSelect('selected.contentChunk', 'chunk')
      .leftJoinAndSelect('selected.documentVersion', 'version')
      .leftJoinAndSelect('version.document', 'document')
      .where('event.id=:id', { id });
    if (user.role !== UserRole.SYSTEM_ADMIN)
      qb.andWhere(
        '(event.requestedBy=:requestedBy OR document.tenantScope=:global OR (document.tenantScope=:school AND document.schoolId=:schoolId))',
        {
          requestedBy: user.id,
          global: TenantScope.GLOBAL,
          school: TenantScope.SCHOOL,
          schoolId: user.schoolId ?? '00000000-0000-0000-0000-000000000000',
        },
      );
    const event = await qb.orderBy('selected.rank', 'ASC').getOne();
    if (!event) throw new NotFoundException('Retrieval Event not found');
    return {
      ...event,
      chunks: event.chunks.map((item) => ({
        label: item.label,
        rank: item.rank,
        contentChunkId: item.contentChunkId,
        documentVersionId: item.documentVersionId,
        vectorScore: item.vectorScore,
        keywordScore: item.keywordScore,
        hybridScore: item.hybridScore,
        estimatedTokens: item.estimatedTokens,
        contentHash: item.contentHash,
        locatorSnapshot: item.locatorSnapshot,
        content: item.contentChunk.content,
      })),
    };
  }
  private settings(dto: RetrievalPreviewDto) {
    const vw = this.config.getOrThrow<number>('retrieval.vectorWeight'),
      kw = this.config.getOrThrow<number>('retrieval.keywordWeight'),
      sum = vw + kw;
    const topK = dto.topK ?? this.config.getOrThrow<number>('retrieval.topK');
    if (topK > this.config.getOrThrow<number>('retrieval.maxTopK'))
      throw new BadRequestException('topK exceeds the configured retrieval maximum');
    return {
      topK,
      minSimilarity: dto.minSimilarity ?? this.config.getOrThrow<number>('retrieval.minSimilarity'),
      contextBudget:
        dto.contextBudgetTokens ?? this.config.getOrThrow<number>('retrieval.contextBudgetTokens'),
      vectorWeight: vw / sum,
      keywordWeight: kw / sum,
      vectorCandidateK: this.config.getOrThrow<number>('retrieval.vectorCandidateK'),
      keywordCandidateK: this.config.getOrThrow<number>('retrieval.keywordCandidateK'),
      strategyVersion: this.config.getOrThrow<string>('retrieval.strategyVersion'),
    };
  }
  private filters(dto: RetrievalPreviewDto, user: AuthenticatedUser) {
    return {
      boardId: dto.boardId,
      classId: dto.classId ?? null,
      subjectId: dto.subjectId ?? null,
      chapterId: dto.chapterId ?? null,
      topicId: dto.topicId ?? null,
      language: dto.language ?? null,
      documentIds: dto.documentIds ?? [],
      tenantScope: user.role === UserRole.SYSTEM_ADMIN ? 'ADMIN' : 'GLOBAL_AND_OWN_SCHOOL',
    };
  }
  private async query(
    vector: readonly number[],
    dto: RetrievalPreviewDto,
    user: AuthenticatedUser,
    configVersion: string,
    s: ReturnType<RetrievalService['settings']>,
  ): Promise<CandidateRow[]> {
    const sql = `WITH eligible AS (
      SELECT DISTINCT c.id,c.document_version_id,d.id document_id,c.chunk_order,c.content,
        c.content_hash,c.estimated_token_count,c.locator_metadata,e.embedding,
        CASE WHEN lower(d.language) LIKE 'en%' THEN c.search_vector_english ELSE c.search_vector_simple END search_vector
      FROM content_chunks c
      JOIN document_versions v ON v.id=c.document_version_id
      JOIN knowledge_documents d ON d.id=v.document_id AND d.active_version_id=v.id
      JOIN document_topic_mappings m ON m.document_version_id=v.id AND m.status='APPROVED'
        AND m.id::text IN (
          SELECT jsonb_array_elements_text(v.publication_mapping_snapshot->'mappingIds')
        )
      JOIN boards b ON b.id=m.board_id AND b.status='ACTIVE'
      LEFT JOIN classes cl ON cl.id=m.class_id
      LEFT JOIN subjects su ON su.id=m.subject_id
      LEFT JOIN chapters ch ON ch.id=m.chapter_id
      LEFT JOIN topics t ON t.id=m.topic_id
      JOIN content_chunk_embeddings e ON e.content_chunk_id=c.id
        AND e.embedding_config_version=$2 AND e.status='COMPLETED' AND e.content_hash=c.content_hash
      WHERE d.status='PUBLISHED' AND v.published_at IS NOT NULL AND v.archived_at IS NULL
        AND v.publication_embedding_config_version=$2
        AND v.publication_mapping_snapshot IS NOT NULL
        AND d.rights_metadata @> '{"permissionConfirmed":true}'::jsonb
        AND v.malware_scan_status='CLEAN' AND v.extraction_status='COMPLETED'
        AND (m.class_id IS NULL OR cl.status='ACTIVE')
        AND (m.subject_id IS NULL OR su.status='ACTIVE')
        AND (m.chapter_id IS NULL OR ch.status='ACTIVE')
        AND (m.topic_id IS NULL OR t.status='ACTIVE')
        AND ($3::boolean OR d.tenant_scope='GLOBAL' OR (d.tenant_scope='SCHOOL' AND d.school_id=$4::uuid))
        AND ($5::text IS NULL OR lower(d.language)=lower($5))
        AND ($6::uuid[] IS NULL OR d.id=ANY($6::uuid[]))
        AND m.board_id=$7::uuid
        AND ($8::uuid IS NULL OR m.class_id IS NULL OR m.class_id=$8)
        AND ($9::uuid IS NULL OR m.subject_id IS NULL OR m.subject_id=$9)
        AND ($10::uuid IS NULL OR m.chapter_id IS NULL OR m.chapter_id=$10)
        AND ($11::uuid IS NULL OR m.topic_id IS NULL OR m.topic_id=$11)
    ),vc AS (
      SELECT id FROM eligible ORDER BY embedding <=> $1::vector LIMIT $12
    ),kc AS (
      SELECT id FROM eligible
      WHERE search_vector @@ websearch_to_tsquery(
        CASE WHEN lower(COALESCE($5,'en')) LIKE 'en%' THEN 'english'::regconfig ELSE 'simple'::regconfig END,$13)
      ORDER BY ts_rank_cd(search_vector,websearch_to_tsquery(
        CASE WHEN lower(COALESCE($5,'en')) LIKE 'en%' THEN 'english'::regconfig ELSE 'simple'::regconfig END,$13)) DESC
      LIMIT $14
    ),pool AS (SELECT id FROM vc UNION SELECT id FROM kc),scored AS (
      SELECT e.*,GREATEST(-1,LEAST(1,1-(e.embedding <=> $1::vector))) vector_score,
        ts_rank_cd(e.search_vector,websearch_to_tsquery(
          CASE WHEN lower(COALESCE($5,'en')) LIKE 'en%' THEN 'english'::regconfig ELSE 'simple'::regconfig END,$13)) keyword_raw
      FROM eligible e JOIN pool p ON p.id=e.id
    )
    SELECT id content_chunk_id,document_version_id,document_id,chunk_order,content,content_hash,
      estimated_token_count estimated_tokens,locator_metadata locator,vector_score,
      keyword_raw/(keyword_raw+1) keyword_score,
      ($15*vector_score+$16*(keyword_raw/(keyword_raw+1))) hybrid_score
    FROM scored WHERE vector_score >= $17
    ORDER BY hybrid_score DESC,vector_score DESC,id ASC LIMIT $18`;
    const admin = user.role === UserRole.SYSTEM_ADMIN;
    const school = user.schoolId;
    const docIds = dto.documentIds?.length ? dto.documentIds : null;
    return this.data.query(sql, [
      `[${vector.join(',')}]`,
      configVersion,
      admin,
      school,
      dto.language ?? null,
      docIds,
      dto.boardId,
      dto.classId ?? null,
      dto.subjectId ?? null,
      dto.chapterId ?? null,
      dto.topicId ?? null,
      s.vectorCandidateK,
      dto.queryText,
      s.keywordCandidateK,
      s.vectorWeight,
      s.keywordWeight,
      s.minSimilarity,
      Math.max(s.vectorCandidateK, s.keywordCandidateK),
    ]);
  }
  private candidate(row: CandidateRow): RankedEvidence {
    return {
      contentChunkId: row.content_chunk_id,
      documentVersionId: row.document_version_id,
      documentId: row.document_id,
      chunkOrder: Number(row.chunk_order),
      content: row.content,
      contentHash: row.content_hash,
      estimatedTokens: Number(row.estimated_tokens),
      locator: row.locator,
      vectorScore: Number(row.vector_score),
      keywordScore: Number(row.keyword_score),
      hybridScore: Number(row.hybrid_score),
    };
  }
  private failure(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 80) : 'RETRIEVAL_FAILED';
  }
}
