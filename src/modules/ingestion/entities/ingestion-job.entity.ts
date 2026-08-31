import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DocumentVersion } from '../../knowledge-base/entities/document-version.entity';
import { IngestionJobStatus, IngestionStep } from '../enums/ingestion.enums';

@Entity('ingestion_jobs')
@Index(['documentVersionId'])
@Index(['status'])
@Index(['createdAt'])
@Check('retry_count >= 0')
export class IngestionJob extends BaseEntity {
  @Column({ name: 'document_version_id', type: 'uuid' }) documentVersionId!: string;
  @ManyToOne(() => DocumentVersion, (v) => v.ingestionJobs, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion!: DocumentVersion;
  @Column({
    type: 'enum',
    enum: IngestionJobStatus,
    enumName: 'ingestion_job_status',
    default: IngestionJobStatus.QUEUED,
  })
  status!: IngestionJobStatus;
  @Column({ name: 'current_step', type: 'enum', enum: IngestionStep, enumName: 'ingestion_step' })
  currentStep!: IngestionStep;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ type: 'jsonb', default: {} }) metrics!: Record<string, unknown>;
  @Column({ name: 'retry_count', type: 'integer', default: 0 }) retryCount!: number;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
}
