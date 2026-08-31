import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FileValidationService } from '../../infrastructure/file-security/file-validation.service';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../../infrastructure/storage/object-storage.provider';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../curriculum/curriculum.utils';
import { IngestionJob } from '../ingestion/entities/ingestion-job.entity';
import { IngestionJobStatus, IngestionStep } from '../ingestion/enums/ingestion.enums';
import {
  CreateKnowledgeDocumentDto,
  ListKnowledgeDocumentsDto,
  ListVersionsDto,
  UpdateKnowledgeDocumentDto,
} from './dto/knowledge-base.dto';
import { DocumentVersion } from './entities/document-version.entity';
import { ContentChunk } from './entities/content-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  MalwareScanStatus,
  TenantScope,
} from './enums/knowledge-base.enums';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KnowledgeDocument) private readonly documents: Repository<KnowledgeDocument>,
    @InjectRepository(DocumentVersion) private readonly versions: Repository<DocumentVersion>,
    @InjectRepository(ContentChunk) private readonly chunks: Repository<ContentChunk>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
    private readonly validation: FileValidationService,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {}
  private visible(qb: SelectQueryBuilder<KnowledgeDocument>, user: AuthenticatedUser) {
    if (user.role !== UserRole.SYSTEM_ADMIN)
      qb.andWhere(
        '(document.tenantScope=:global OR (document.tenantScope=:school AND document.schoolId=:schoolId))',
        {
          global: TenantScope.GLOBAL,
          school: TenantScope.SCHOOL,
          schoolId: user.schoolId ?? '00000000-0000-0000-0000-000000000000',
        },
      );
    return qb;
  }
  private response(d: KnowledgeDocument) {
    return {
      id: d.id,
      title: d.title,
      tenantScope: d.tenantScope,
      schoolId: d.schoolId,
      sourceType: d.sourceType,
      language: d.language,
      rights: d.rightsMetadata,
      status: d.status,
      activeVersionId: d.activeVersionId,
      createdBy: d.createdBy,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }
  private versionResponse(v: DocumentVersion) {
    return {
      id: v.id,
      documentId: v.documentId,
      versionNo: v.versionNo,
      checksum: v.checksum,
      mimeType: v.mimeType,
      validatedMimeType: v.validatedMimeType,
      originalFilename: v.originalFilename,
      fileSize: v.fileSize,
      pageCount: v.pageCount,
      extractionStatus: v.extractionStatus,
      malwareScanStatus: v.malwareScanStatus,
      publishedAt: v.publishedAt,
      archivedAt: v.archivedAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
  private assertRights(rights: { permissionConfirmed: boolean }) {
    if (rights.permissionConfirmed !== true)
      throw new BadRequestException('Rights permission confirmation is required');
  }
  async create(dto: CreateKnowledgeDocumentDto, user: AuthenticatedUser) {
    this.assertRights(dto.rights);
    if (user.role === UserRole.SYSTEM_ADMIN && dto.tenantScope !== TenantScope.GLOBAL)
      throw new BadRequestException(
        'System administrators create GLOBAL documents through this endpoint',
      );
    if (user.role === UserRole.SCHOOL_ADMIN && dto.tenantScope !== TenantScope.SCHOOL)
      throw new ForbiddenException('School administrators may create only SCHOOL documents');
    if (user.role === UserRole.SCHOOL_ADMIN && !user.schoolId)
      throw new ForbiddenException('A school assignment is required');
    const document = await this.data.transaction(async (manager) => {
      const saved = await manager.getRepository(KnowledgeDocument).save({
        title: dto.title,
        tenantScope: dto.tenantScope,
        schoolId: dto.tenantScope === TenantScope.SCHOOL ? user.schoolId : null,
        sourceType: dto.sourceType,
        language: dto.language,
        rightsMetadata: dto.rights,
        status: KnowledgeDocumentStatus.DRAFT,
        activeVersionId: null,
        createdBy: user.id,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'kb.document.create',
          entityType: 'knowledge_document',
          entityId: saved.id,
          metadata: { tenantScope: saved.tenantScope, sourceType: saved.sourceType },
        },
        manager,
      );
      return saved;
    });
    return this.response(document);
  }
  async list(query: ListKnowledgeDocumentsDto, user: AuthenticatedUser) {
    const qb = this.documents
      .createQueryBuilder('document')
      .where('document.status=:status', { status: query.status });
    this.visible(qb, user);
    if (query.tenantScope)
      qb.andWhere('document.tenantScope=:tenantScope', { tenantScope: query.tenantScope });
    if (query.sourceType)
      qb.andWhere('document.sourceType=:sourceType', { sourceType: query.sourceType });
    if (query.language) qb.andWhere('document.language=:language', { language: query.language });
    if (query.search) qb.andWhere('document.title ILIKE :search', { search: `%${query.search}%` });
    const sorts: Record<string, string> = {
      title: 'document.title',
      createdAt: 'document.createdAt',
      updatedAt: 'document.updatedAt',
      status: 'document.status',
    };
    qb.orderBy(sorts[query.sortBy ?? ''] ?? 'document.createdAt', query.sortOrder);
    const page = await paginate(qb, query);
    return { ...page, items: page.items.map((d) => this.response(d)) };
  }
  async scoped(id: string, user: AuthenticatedUser, includeArchived = false) {
    const qb = this.documents.createQueryBuilder('document').where('document.id=:id', { id });
    this.visible(qb, user);
    if (!includeArchived)
      qb.andWhere('document.status != :archived', { archived: KnowledgeDocumentStatus.ARCHIVED });
    const found = await qb.getOne();
    if (found) return found;
    const authorized = this.documents
      .createQueryBuilder('document')
      .where('document.id=:id', { id });
    this.visible(authorized, user);
    if (await authorized.getExists()) throw new NotFoundException('Knowledge Document not found');
    if (await this.documents.exist({ where: { id } }))
      throw new ForbiddenException('You do not have permission to access this Knowledge Document');
    throw new NotFoundException('Knowledge Document not found');
  }
  async find(id: string, user: AuthenticatedUser) {
    return this.response(await this.scoped(id, user));
  }
  private assertManage(d: KnowledgeDocument, user: AuthenticatedUser) {
    if (user.role === UserRole.SYSTEM_ADMIN) return;
    if (
      user.role !== UserRole.SCHOOL_ADMIN ||
      d.tenantScope !== TenantScope.SCHOOL ||
      d.schoolId !== user.schoolId
    )
      throw new ForbiddenException('You do not have permission to manage this Knowledge Document');
  }
  async update(id: string, dto: UpdateKnowledgeDocumentDto, user: AuthenticatedUser) {
    const d = await this.scoped(id, user);
    this.assertManage(d, user);
    if (dto.rights) this.assertRights(dto.rights);
    await this.data.transaction(async (manager) => {
      await manager.getRepository(KnowledgeDocument).update(id, {
        ...(dto.title && { title: dto.title }),
        ...(dto.language && { language: dto.language }),
        ...(dto.rights && { rightsMetadata: dto.rights }),
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'kb.document.update',
          entityType: 'knowledge_document',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
        },
        manager,
      );
    });
    return this.find(id, user);
  }
  async archive(id: string, user: AuthenticatedUser) {
    const d = await this.scoped(id, user);
    this.assertManage(d, user);
    await this.data.transaction(async (manager) => {
      await manager
        .getRepository(KnowledgeDocument)
        .update(id, { status: KnowledgeDocumentStatus.ARCHIVED });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'kb.document.archive',
          entityType: 'knowledge_document',
          entityId: id,
        },
        manager,
      );
    });
  }
  async upload(id: string, file: UploadedFile | undefined, user: AuthenticatedUser) {
    const d = await this.scoped(id, user);
    this.assertManage(d, user);
    if (!file) throw new BadRequestException('A file is required');
    const max = this.config.getOrThrow<number>('knowledgeBase.maxFileSizeBytes');
    if (file.size > max) throw new BadRequestException('File exceeds maximum permitted size');
    const allowed = this.config.getOrThrow<string[]>('knowledgeBase.allowedMimeTypes');
    const valid = this.validation.validate(file, d.sourceType, allowed);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const tenant = d.tenantScope === TenantScope.GLOBAL ? 'global' : `school/${d.schoolId}`;
    const key = `quarantine/${tenant}/${randomUUID()}`;
    await this.storage.putObject(key, file.buffer, valid.mimeType);
    try {
      return await this.data.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
        if (
          await manager
            .getRepository(DocumentVersion)
            .exist({ where: { documentId: id, checksum } })
        )
          throw new ConflictException('This exact file version already exists');
        const raw = await manager
          .getRepository(DocumentVersion)
          .createQueryBuilder('v')
          .select('COALESCE(MAX(v.versionNo),0)', 'max')
          .where('v.documentId=:id', { id })
          .getRawOne<{ max: string }>();
        const version = await manager.getRepository(DocumentVersion).save({
          documentId: id,
          versionNo: Number(raw?.max ?? 0) + 1,
          storageKey: key,
          checksum,
          mimeType: file.mimetype,
          validatedMimeType: valid.mimeType,
          originalFilename: valid.originalFilename,
          fileSize: file.size,
          pageCount: null,
          extractionStatus: ExtractionStatus.PENDING,
          malwareScanStatus: MalwareScanStatus.NOT_SCANNED,
          publishedAt: null,
          archivedAt: null,
        });
        const job = await manager.getRepository(IngestionJob).save({
          documentVersionId: version.id,
          status: IngestionJobStatus.QUEUED,
          currentStep: IngestionStep.SIGNATURE_VALIDATION,
          errorCode: null,
          errorMessage: null,
          metrics: { queueDispatched: false, malwareScan: 'NOT_SCANNED' },
          retryCount: 0,
          startedAt: null,
          completedAt: null,
        });
        await manager
          .getRepository(KnowledgeDocument)
          .update(id, { status: KnowledgeDocumentStatus.PROCESSING });
        await this.audit.record(
          {
            actorId: user.id,
            action: 'kb.version.upload',
            entityType: 'document_version',
            entityId: version.id,
            metadata: {
              documentId: id,
              tenantScope: d.tenantScope,
              sourceType: d.sourceType,
              fileSize: file.size,
              checksum,
            },
          },
          manager,
        );
        return { version: this.versionResponse(version), ingestionJob: job };
      });
    } catch (error) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }
  }
  async listVersions(id: string, query: ListVersionsDto, user: AuthenticatedUser) {
    await this.scoped(id, user);
    const qb = this.versions
      .createQueryBuilder('version')
      .where('version.documentId=:id', { id })
      .orderBy('version.versionNo', 'DESC');
    const page = await paginate(qb, query);
    return { ...page, items: page.items.map((v) => this.versionResponse(v)) };
  }
  async findVersion(id: string, user: AuthenticatedUser) {
    const qb = this.versions
      .createQueryBuilder('version')
      .innerJoinAndSelect('version.document', 'document')
      .leftJoinAndSelect('version.ingestionJobs', 'job')
      .where('version.id=:id', { id });
    this.visible(qb as unknown as SelectQueryBuilder<KnowledgeDocument>, user);
    const v = await qb.orderBy('job.createdAt', 'DESC').getOne();
    if (!v) {
      if (await this.versions.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to access this Document Version');
      throw new NotFoundException('Document Version not found');
    }
    return { ...this.versionResponse(v), ingestionJob: v.ingestionJobs?.[0] ?? null };
  }
  async listChunks(versionId: string, query: ListVersionsDto, user: AuthenticatedUser) {
    await this.findVersion(versionId, user);
    const qb = this.chunks
      .createQueryBuilder('chunk')
      .where('chunk.documentVersionId=:versionId', { versionId })
      .orderBy('chunk.chunkOrder', 'ASC');
    const page = await paginate(qb, query);
    return {
      ...page,
      items: page.items.map((chunk) => ({
        id: chunk.id,
        chunkOrder: chunk.chunkOrder,
        content: chunk.content,
        contentHash: chunk.contentHash,
        estimatedTokenCount: chunk.estimatedTokenCount,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        sectionTitle: chunk.sectionTitle,
        locatorMetadata: chunk.locatorMetadata,
        createdAt: chunk.createdAt,
      })),
    };
  }
}
