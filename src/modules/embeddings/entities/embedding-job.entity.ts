import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DocumentVersion } from '../../knowledge-base/entities/document-version.entity';
import { EmbeddingJobStatus } from '../embedding.enums';

@Entity('embedding_jobs')
@Index(['documentVersionId'])
@Index(['status'])
@Check('retry_count >= 0')
export class EmbeddingJob extends BaseEntity {
  @Column({ name: 'document_version_id', type: 'uuid' }) documentVersionId!: string;
  @ManyToOne(() => DocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion!: DocumentVersion;
  @Column({ length: 40 }) provider!: string;
  @Column({ length: 120 }) model!: string;
  @Column({ type: 'integer' }) dimension!: number;
  @Column({ name: 'config_version', length: 64 }) configVersion!: string;
  @Column({ type: 'enum', enum: EmbeddingJobStatus, enumName: 'embedding_job_status' })
  status!: EmbeddingJobStatus;
  @Column({ name: 'total_chunks', type: 'integer', default: 0 }) totalChunks!: number;
  @Column({ name: 'processed_chunks', type: 'integer', default: 0 }) processedChunks!: number;
  @Column({ name: 'embedded_chunks', type: 'integer', default: 0 }) embeddedChunks!: number;
  @Column({ name: 'failed_chunks', type: 'integer', default: 0 }) failedChunks!: number;
  @Column({ name: 'skipped_chunks', type: 'integer', default: 0 }) skippedChunks!: number;
  @Column({ name: 'input_tokens', type: 'integer', nullable: true }) inputTokens!: number | null;
  @Column({ name: 'request_count', type: 'integer', default: 0 }) requestCount!: number;
  @Column({ name: 'retry_count', type: 'integer', default: 0 }) retryCount!: number;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ type: 'jsonb', default: {} }) metrics!: Record<string, unknown>;
}
