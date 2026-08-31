import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { paginate, translateUnique } from '../curriculum/curriculum.utils';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { IngestionJobStatus, IngestionStep } from '../ingestion/enums/ingestion.enums';
import { CreateMappingDto, CoverageQueryDto, ListMappingsDto } from './dto/mapping.dto';
import { ContentChunk } from './entities/content-chunk.entity';
import { DocumentTopicMapping } from './entities/document-topic-mapping.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  MappingStatus,
  TenantScope,
} from './enums/knowledge-base.enums';
import { KnowledgeReadinessService } from './knowledge-readiness.service';
import { mappingSpecificity } from './mapping-specificity';
import { CurriculumMappingValidator } from './curriculum-mapping-validator.service';
import { PublicationPreflightService } from './publication-preflight.service';
import { EmbeddingConfigService } from '../embeddings/embedding-config.service';

@Injectable()
export class DocumentMappingsService {
  constructor(
    @InjectRepository(DocumentTopicMapping) private mappings: Repository<DocumentTopicMapping>,
    @InjectRepository(DocumentVersion) private versions: Repository<DocumentVersion>,
    @InjectRepository(KnowledgeDocument) private documents: Repository<KnowledgeDocument>,
    @InjectRepository(ContentChunk) private chunks: Repository<ContentChunk>,
    private data: DataSource,
    private validator: CurriculumMappingValidator,
    private readiness: KnowledgeReadinessService,
    private preflight: PublicationPreflightService,
    private embeddingConfig: EmbeddingConfigService,
    private audit: AuditService,
  ) {}
  private scope<T>(qb: SelectQueryBuilder<T & object>, user: AuthenticatedUser) {
    if (user.role !== UserRole.SYSTEM_ADMIN)
      qb.andWhere(
        '(document.tenantScope=:global OR (document.tenantScope=:school AND document.schoolId=:schoolId))',
        {
          global: TenantScope.GLOBAL,
          school: TenantScope.SCHOOL,
          schoolId: user.schoolId ?? '00000000-0000-0000-0000-000000000000',
        },
      );
  }
  private async version(id: string, user: AuthenticatedUser) {
    const qb = this.versions
      .createQueryBuilder('version')
      .innerJoinAndSelect('version.document', 'document')
      .leftJoinAndSelect('version.ingestionJobs', 'job')
      .where('version.id=:id', { id });
    this.scope(qb, user);
    const v = await qb.orderBy('job.createdAt', 'DESC').getOne();
    if (!v) {
      if (await this.versions.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to access this Document Version');
      throw new NotFoundException('Document Version not found');
    }
    return v;
  }
  private assertMutate(v: DocumentVersion, user: AuthenticatedUser) {
    if (user.role === UserRole.SYSTEM_ADMIN) return;
    if (
      user.role !== UserRole.SCHOOL_ADMIN ||
      v.document.tenantScope !== TenantScope.SCHOOL ||
      v.document.schoolId !== user.schoolId
    )
      throw new ForbiddenException(
        'You do not have permission to manage mappings for this version',
      );
  }
  private response(m: DocumentTopicMapping) {
    return {
      id: m.id,
      documentVersionId: m.documentVersionId,
      boardId: m.boardId,
      classId: m.classId,
      subjectId: m.subjectId,
      chapterId: m.chapterId,
      topicId: m.topicId,
      status: m.status,
      specificity: mappingSpecificity(m),
      mappedBy: m.mappedBy,
      approvedBy: m.approvedBy,
      approvedAt: m.approvedAt,
      rejectionReason: m.rejectionReason,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }
  async create(versionId: string, dto: CreateMappingDto, user: AuthenticatedUser) {
    const v = await this.version(versionId, user);
    this.assertMutate(v, user);
    if (v.document.status === KnowledgeDocumentStatus.ARCHIVED || v.archivedAt)
      throw new ConflictException('Archived content cannot be mapped');
    if (v.publishedAt) throw new ConflictException('Published mapping snapshots are immutable');
    if (
      v.extractionStatus !== ExtractionStatus.COMPLETED ||
      ![
        KnowledgeDocumentStatus.READY_FOR_MAPPING,
        KnowledgeDocumentStatus.READY_FOR_REVIEW,
      ].includes(v.document.status)
    )
      throw new ConflictException('Document version is not ready for mapping');
    await this.validator.validate(dto);
    try {
      const saved = await this.data.transaction(async (manager) => {
        const m = await manager.getRepository(DocumentTopicMapping).save({
          ...dto,
          documentVersionId: versionId,
          classId: dto.classId ?? null,
          subjectId: dto.subjectId ?? null,
          chapterId: dto.chapterId ?? null,
          topicId: dto.topicId ?? null,
          status: MappingStatus.DRAFT,
          mappedBy: user.id,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
        });
        await this.audit.record(
          {
            actorId: user.id,
            action: 'kb.mapping.create',
            entityType: 'document_topic_mapping',
            entityId: m.id,
            metadata: { documentVersionId: versionId, specificity: mappingSpecificity(m) },
          },
          manager,
        );
        return m;
      });
      return this.response(saved);
    } catch (e) {
      translateUnique(e, 'This curriculum mapping already exists');
    }
  }
  async list(versionId: string, q: ListMappingsDto, user: AuthenticatedUser) {
    await this.version(versionId, user);
    const qb = this.mappings
      .createQueryBuilder('m')
      .where('m.documentVersionId=:versionId', { versionId });
    for (const k of ['status', 'boardId', 'classId', 'subjectId', 'chapterId', 'topicId'] as const)
      if (q[k]) qb.andWhere(`m.${k}=:${k}`, { [k]: q[k] });
    qb.orderBy('m.createdAt', 'DESC');
    const page = await paginate(qb, q);
    return { ...page, items: page.items.map((m) => this.response(m)) };
  }
  private async mapping(id: string, user: AuthenticatedUser) {
    const qb = this.mappings
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.documentVersion', 'version')
      .innerJoinAndSelect('version.document', 'document')
      .where('m.id=:id', { id });
    this.scope(qb, user);
    const m = await qb.getOne();
    if (!m) {
      if (await this.mappings.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to access this mapping');
      throw new NotFoundException('Mapping not found');
    }
    return m;
  }
  async transition(id: string, next: MappingStatus, user: AuthenticatedUser, reason?: string) {
    const m = await this.mapping(id, user);
    this.assertMutate(m.documentVersion, user);
    if (m.documentVersion.publishedAt)
      throw new ConflictException('Published mapping snapshots are immutable');
    if (next === MappingStatus.PENDING_REVIEW || next === MappingStatus.APPROVED)
      await this.validator.validate(m);
    const allowed: Record<MappingStatus, MappingStatus[]> = {
      [MappingStatus.DRAFT]: [MappingStatus.PENDING_REVIEW, MappingStatus.ARCHIVED],
      [MappingStatus.PENDING_REVIEW]: [
        MappingStatus.APPROVED,
        MappingStatus.REJECTED,
        MappingStatus.ARCHIVED,
      ],
      [MappingStatus.APPROVED]: [MappingStatus.ARCHIVED],
      [MappingStatus.REJECTED]: [MappingStatus.PENDING_REVIEW, MappingStatus.ARCHIVED],
      [MappingStatus.ARCHIVED]: [],
    };
    if (m.status === next) return this.response(m);
    if (!allowed[m.status].includes(next))
      throw new ConflictException(`Cannot transition mapping from ${m.status} to ${next}`);
    await this.data.transaction(async (manager) => {
      await manager.getRepository(DocumentTopicMapping).update(id, {
        status: next,
        approvedBy: next === MappingStatus.APPROVED ? user.id : null,
        approvedAt: next === MappingStatus.APPROVED ? new Date() : null,
        rejectionReason: next === MappingStatus.REJECTED ? (reason ?? null) : null,
      });
      const action = next === MappingStatus.PENDING_REVIEW ? 'submit_review' : next.toLowerCase();
      await this.audit.record(
        {
          actorId: user.id,
          action: `kb.mapping.${action}`,
          entityType: 'document_topic_mapping',
          entityId: id,
          metadata: { documentVersionId: m.documentVersionId },
        },
        manager,
      );
    });
    await this.recalculate(m.documentVersionId, user.id);
    return this.response(await this.mapping(id, user));
  }
  async recalculate(versionId: string, actorId: string) {
    const v = await this.versions
      .createQueryBuilder('version')
      .innerJoinAndSelect('version.document', 'document')
      .where('version.id=:id', { id: versionId })
      .getOneOrFail();
    const r = await this.readiness.evaluate(v);
    const status = r.reviewReady
      ? KnowledgeDocumentStatus.READY_FOR_REVIEW
      : KnowledgeDocumentStatus.READY_FOR_MAPPING;
    if (v.document.status !== status && v.document.status !== KnowledgeDocumentStatus.ARCHIVED) {
      await this.data.transaction(async (manager) => {
        await manager.getRepository(KnowledgeDocument).update(v.document.id, { status });
        await manager
          .getRepository(IngestionJob)
          .createQueryBuilder()
          .update()
          .set({
            status: r.reviewReady
              ? IngestionJobStatus.COMPLETED
              : IngestionJobStatus.AWAITING_MAPPING,
            currentStep: r.reviewReady
              ? IngestionStep.READY_FOR_REVIEW
              : IngestionStep.READY_FOR_MAPPING,
          })
          .where('documentVersionId=:versionId', { versionId })
          .execute();
        if (r.reviewReady)
          await this.audit.record(
            {
              actorId,
              action: 'kb.version.review_ready',
              entityType: 'document_version',
              entityId: versionId,
            },
            manager,
          );
      });
    }
    return r;
  }
  async readinessFor(versionId: string, user: AuthenticatedUser) {
    const v = await this.version(versionId, user);
    return this.readiness.evaluate(v);
  }
  async submitVersionReview(versionId: string, user: AuthenticatedUser) {
    const v = await this.version(versionId, user);
    this.assertMutate(v, user);
    const r = await this.recalculate(versionId, user.id);
    if (!r.reviewReady)
      throw new ConflictException({
        message: 'Document version is not ready for review',
        readiness: r.reviewBlockers,
      });
    return r;
  }
  async publish(versionId: string, user: AuthenticatedUser) {
    const v = await this.version(versionId, user);
    this.assertMutate(v, user);
    const r = await this.preflight.evaluate(v);
    await this.audit.record({
      actorId: user.id,
      action: 'kb.publication.preflight',
      entityType: 'document_version',
      entityId: versionId,
      metadata: { blockers: r.publicationBlockers },
      outcome: r.publicationReady ? 'SUCCEEDED' : 'BLOCKED',
    });
    if (!r.publicationReady) {
      await this.audit.record({
        actorId: user.id,
        action: 'kb.publication.blocked',
        entityType: 'document_version',
        entityId: versionId,
        metadata: { blockers: r.publicationBlockers },
        outcome: 'BLOCKED',
      });
      throw new ConflictException({
        message: 'Publication preflight blocked',
        readiness: r.publicationBlockers,
      });
    }
    return this.data.transaction('SERIALIZABLE', async (manager) => {
      const locked = await manager
        .getRepository(DocumentVersion)
        .createQueryBuilder('version')
        .innerJoinAndSelect('version.document', 'document')
        .where('version.id=:versionId', { versionId })
        .setLock('pessimistic_write')
        .getOneOrFail();
      await manager
        .getRepository(KnowledgeDocument)
        .createQueryBuilder('document')
        .where('document.id=:id', { id: locked.documentId })
        .setLock('pessimistic_write')
        .getOneOrFail();
      if (locked.publishedAt && locked.document.activeVersionId === locked.id)
        return {
          documentId: locked.documentId,
          documentVersionId: locked.id,
          publishedAt: locked.publishedAt,
        };
      if (locked.document.status !== KnowledgeDocumentStatus.READY_FOR_REVIEW)
        throw new ConflictException('Document version must be READY_FOR_REVIEW before publication');
      const current = await this.preflight.evaluate(locked, manager);
      if (!current.publicationReady)
        throw new ConflictException({
          message: 'Publication preflight blocked',
          readiness: current.publicationBlockers,
        });
      const approved = await manager.getRepository(DocumentTopicMapping).find({
        where: { documentVersionId: locked.id, status: MappingStatus.APPROVED },
        order: { id: 'ASC' },
      });
      const active = this.embeddingConfig.active();
      const publishedAt = new Date();
      await manager.getRepository(DocumentVersion).update(locked.id, {
        publishedAt,
        publicationEmbeddingConfigVersion: active.configVersion,
        publicationMappingSnapshot: {
          mappingIds: approved.map((item) => item.id),
          publishedAt: publishedAt.toISOString(),
        },
      });
      await manager.getRepository(KnowledgeDocument).update(locked.documentId, {
        activeVersionId: locked.id,
        status: KnowledgeDocumentStatus.PUBLISHED,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'kb.publication.publish',
          entityType: 'document_version',
          entityId: locked.id,
          metadata: {
            documentId: locked.documentId,
            embeddingConfigVersion: active.configVersion,
            mappingIds: approved.map((item) => item.id),
          },
        },
        manager,
      );
      return {
        documentId: locked.documentId,
        documentVersionId: locked.id,
        publishedAt,
        activeVersionId: locked.id,
      };
    });
  }
  async preview(versionId: string, user: AuthenticatedUser) {
    const v = await this.version(versionId, user);
    const r = await this.readiness.evaluate(v);
    const [chunkCount, mappingCount, approvedMappingCount] = await Promise.all([
      this.chunks.countBy({ documentVersionId: versionId }),
      this.mappings.countBy({ documentVersionId: versionId }),
      this.mappings.countBy({ documentVersionId: versionId, status: MappingStatus.APPROVED }),
    ]);
    return {
      document: {
        id: v.document.id,
        title: v.document.title,
        tenantScope: v.document.tenantScope,
        schoolId: v.document.schoolId,
        status: v.document.status,
        rightsConfirmed: v.document.rightsMetadata.permissionConfirmed,
      },
      version: {
        id: v.id,
        versionNo: v.versionNo,
        extractionStatus: v.extractionStatus,
        malwareScanStatus: v.malwareScanStatus,
        pageCount: v.pageCount,
        archivedAt: v.archivedAt,
      },
      ingestionJob: v.ingestionJobs?.[0] ?? null,
      metrics: v.ingestionJobs?.[0]?.metrics ?? {},
      chunkCount,
      mappingSummary: { total: mappingCount, approved: approvedMappingCount },
      readiness: r,
    };
  }
  async coverage(q: CoverageQueryDto, user: AuthenticatedUser) {
    await this.validator.validate(q);
    const qb = this.mappings
      .createQueryBuilder('m')
      .innerJoin('m.documentVersion', 'version')
      .innerJoin('version.document', 'document')
      .innerJoin(ContentChunk, 'chunk', 'chunk.documentVersionId=version.id')
      .where('m.status=:approved', { approved: MappingStatus.APPROVED })
      .andWhere('document.status != :archived', { archived: KnowledgeDocumentStatus.ARCHIVED });
    this.scope(qb, user);
    for (const k of ['boardId', 'classId', 'subjectId', 'chapterId', 'topicId'] as const)
      if (q[k]) qb.andWhere(`(m.${k}=:${k} OR m.${k} IS NULL)`, { [k]: q[k] });
    const raw = await qb
      .select('COUNT(DISTINCT document.id)', 'documents')
      .addSelect('COUNT(DISTINCT version.id)', 'versions')
      .addSelect('COUNT(DISTINCT chunk.id)', 'chunks')
      .addSelect('COUNT(DISTINCT m.id)', 'mappings')
      .getRawOne<Record<string, string>>();
    return {
      scope: q,
      coverage: {
        hasMappedContent: Number(raw?.mappings ?? 0) > 0,
        approvedMappings: Number(raw?.mappings ?? 0),
        mappedDocumentCount: Number(raw?.documents ?? 0),
        documentVersions: Number(raw?.versions ?? 0),
        chunks: Number(raw?.chunks ?? 0),
        publicationReadyVersions: 0,
      },
    };
  }
}
