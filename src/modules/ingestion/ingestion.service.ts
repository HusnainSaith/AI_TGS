import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { IngestionQueueProducer } from '../../infrastructure/queue/queue-producers.service';
import { KnowledgeDocumentStatus, TenantScope } from '../knowledge-base/enums/knowledge-base.enums';
import { IngestionJob } from './entities/ingestion-job.entity';
import { IngestionJobStatus, IngestionStep } from './enums/ingestion.enums';
@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(IngestionJob) private readonly jobs: Repository<IngestionJob>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
    @Optional() private readonly queue?: IngestionQueueProducer,
  ) {}
  private query(id: string, user: AuthenticatedUser) {
    const qb = this.jobs
      .createQueryBuilder('job')
      .innerJoinAndSelect('job.documentVersion', 'version')
      .innerJoinAndSelect('version.document', 'document')
      .where('job.id=:id', { id });
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
  private response(j: IngestionJob) {
    return {
      id: j.id,
      documentVersionId: j.documentVersionId,
      status: j.status,
      currentStep: j.currentStep,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      metrics: j.metrics,
      retryCount: j.retryCount,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    };
  }
  async find(id: string, user: AuthenticatedUser) {
    const job = await this.query(id, user).getOne();
    if (job) return this.response(job);
    if (await this.jobs.exist({ where: { id } }))
      throw new ForbiddenException('You do not have permission to access this Ingestion Job');
    throw new NotFoundException('Ingestion Job not found');
  }
  async retry(id: string, user: AuthenticatedUser) {
    const job = await this.query(id, user).getOne();
    if (!job) {
      if (await this.jobs.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to retry this Ingestion Job');
      throw new NotFoundException('Ingestion Job not found');
    }
    const d = job.documentVersion.document;
    if (
      user.role !== UserRole.SYSTEM_ADMIN &&
      (user.role !== UserRole.SCHOOL_ADMIN || d.schoolId !== user.schoolId)
    )
      throw new ForbiddenException('You do not have permission to retry this Ingestion Job');
    const stale =
      job.status === IngestionJobStatus.PROCESSING &&
      Boolean(job.leaseExpiresAt && job.leaseExpiresAt < new Date());
    if (job.status !== IngestionJobStatus.FAILED && !stale)
      throw new ConflictException('Only failed or stale processing jobs may be retried');
    if (job.errorCode === 'MALWARE_DETECTED')
      throw new ConflictException('Malware-detected jobs cannot be retried');
    if (job.retryCount >= 3) throw new ConflictException('Maximum ingestion retry count reached');
    await this.data.transaction(async (manager) => {
      await manager.getRepository(IngestionJob).update(id, {
        status: IngestionJobStatus.QUEUED,
        currentStep: IngestionStep.SIGNATURE_VALIDATION,
        errorCode: null,
        errorMessage: null,
        retryCount: job.retryCount + 1,
        startedAt: null,
        completedAt: null,
        processingToken: null,
        leaseExpiresAt: null,
        metrics: { ...job.metrics, queueDispatched: false },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'kb.ingestion.retry',
          entityType: 'ingestion_job',
          entityId: id,
          metadata: { retryCount: job.retryCount + 1 },
        },
        manager,
      );
    });
    const result = await this.find(id, user);
    const dispatch = await this.queue
      ?.dispatch(id)
      .catch(() => ({ dispatched: false, queue: 'kb-ingestion', bullJobId: null }));
    return {
      ...result,
      dispatch: dispatch ?? { dispatched: false, queue: 'kb-ingestion', bullJobId: null },
    };
  }
  async authorizeProcessing(id: string, user: AuthenticatedUser) {
    const job = await this.query(id, user).getOne();
    if (!job) {
      if (await this.jobs.exist({ where: { id } }))
        throw new ForbiddenException('You do not have permission to process this Ingestion Job');
      throw new NotFoundException('Ingestion Job not found');
    }
    const document = job.documentVersion.document;
    if (
      user.role !== UserRole.SYSTEM_ADMIN &&
      (user.role !== UserRole.SCHOOL_ADMIN ||
        document.tenantScope !== TenantScope.SCHOOL ||
        document.schoolId !== user.schoolId)
    )
      throw new ForbiddenException('You do not have permission to process this Ingestion Job');
    if (document.status === KnowledgeDocumentStatus.ARCHIVED)
      throw new ConflictException('Archived documents cannot be processed');
    return job;
  }
}
