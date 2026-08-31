import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { GenerationJobStatus, GroundingMode } from '../generation.enums';
import { GenerationJobItem } from './generation-job-item.entity';
@Entity('generation_jobs')
@Index(['requestedBy'])
@Index(['status'])
@Index(['createdAt'])
export class GenerationJob {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'requested_by', type: 'uuid' }) requestedBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: User;
  @Column({ name: 'request_payload', type: 'jsonb' }) requestPayload!: Record<string, unknown>;
  @Column({ type: 'enum', enum: GenerationJobStatus, enumName: 'generation_job_status' })
  status!: GenerationJobStatus;
  @Column({ name: 'requested_count', type: 'integer' }) requestedCount!: number;
  @Column({ name: 'generated_count', type: 'integer', default: 0 }) generatedCount!: number;
  @Column({ name: 'failed_count', type: 'integer', default: 0 }) failedCount!: number;
  @Column({ length: 40 }) provider!: string;
  @Column({ length: 120 }) model!: string;
  @Column({ name: 'prompt_strategy_version', length: 64 }) promptStrategyVersion!: string;
  @Column({ name: 'retrieval_strategy_version', length: 64 }) retrievalStrategyVersion!: string;
  @Column({ name: 'embedding_config_version', length: 64 }) embeddingConfigVersion!: string;
  @Column({
    name: 'grounding_mode',
    type: 'enum',
    enum: GroundingMode,
    enumName: 'generation_grounding_mode',
  })
  groundingMode!: GroundingMode;
  @Column({ name: 'token_usage', type: 'jsonb', nullable: true }) tokenUsage!: Record<
    string,
    number
  > | null;
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true }) cost!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => GenerationJobItem, (item) => item.job) items!: GenerationJobItem[];
}
