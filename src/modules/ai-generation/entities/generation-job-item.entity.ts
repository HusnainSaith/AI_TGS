import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionDifficulty, QuestionType } from '../../questions/enums/question.enums';
import { Question } from '../../questions/entities/question.entity';
import { RetrievalEvent } from '../../retrieval/entities/retrieval-event.entity';
import { Topic } from '../../curriculum/curriculum.entities';
import { GenerationItemStatus } from '../generation.enums';
import { GenerationJob } from './generation-job.entity';
@Entity('generation_job_items')
@Index(['generationJobId'])
@Index(['status'])
@Index(['unitTopicId'])
export class GenerationJobItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'generation_job_id', type: 'uuid' }) generationJobId!: string;
  @ManyToOne(() => GenerationJob, (job) => job.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'generation_job_id' })
  job!: GenerationJob;
  @Column({ name: 'question_id', type: 'uuid', nullable: true }) questionId!: string | null;
  @ManyToOne(() => Question, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'question_id' })
  question!: Question | null;
  @Column({ name: 'unit_topic_id', type: 'uuid' }) unitTopicId!: string;
  @ManyToOne(() => Topic, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_topic_id' })
  topic!: Topic;
  @Column({ name: 'unit_type', type: 'enum', enum: QuestionType, enumName: 'question_type' })
  unitType!: QuestionType;
  @Column({ type: 'enum', enum: QuestionDifficulty, enumName: 'question_difficulty' })
  difficulty!: QuestionDifficulty;
  @Column({ name: 'requested_count', type: 'integer' }) requestedCount!: number;
  @Column({ name: 'generated_count', type: 'integer', default: 0 }) generatedCount!: number;
  @Column({ type: 'enum', enum: GenerationItemStatus, enumName: 'generation_item_status' })
  status!: GenerationItemStatus;
  @Column({ name: 'retrieval_event_id', type: 'uuid', nullable: true }) retrievalEventId!:
    string | null;
  @ManyToOne(() => RetrievalEvent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'retrieval_event_id' })
  retrievalEvent!: RetrievalEvent | null;
  @Column({ name: 'retry_count', type: 'integer', default: 0 }) retryCount!: number;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 120, nullable: true })
  rejectionReason!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'request_metadata', type: 'jsonb' }) requestMetadata!: Record<string, unknown>;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
