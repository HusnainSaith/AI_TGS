import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { RetrievalEventStatus } from '../retrieval.enums';
import { RetrievalEventChunk } from './retrieval-event-chunk.entity';
@Entity('retrieval_events')
@Index(['requestedBy'])
@Index(['status'])
@Index(['createdAt'])
export class RetrievalEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'requested_by', type: 'uuid', nullable: true }) requestedBy!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: User | null;
  @Column({ name: 'query_text', type: 'text' }) queryText!: string;
  @Column({ type: 'jsonb' }) filters!: Record<string, unknown>;
  @Column({ name: 'strategy_version', length: 64 }) strategyVersion!: string;
  @Column({ name: 'embedding_config_version', length: 64 }) embeddingConfigVersion!: string;
  @Column({ name: 'top_k', type: 'integer' }) topK!: number;
  @Column({ name: 'min_similarity', type: 'double precision' }) minSimilarity!: number;
  @Column({ name: 'vector_weight', type: 'double precision' }) vectorWeight!: number;
  @Column({ name: 'keyword_weight', type: 'double precision' }) keywordWeight!: number;
  @Column({ name: 'context_budget_tokens', type: 'integer' }) contextBudgetTokens!: number;
  @Column({ name: 'candidate_count', type: 'integer', default: 0 }) candidateCount!: number;
  @Column({ name: 'result_count', type: 'integer', default: 0 }) resultCount!: number;
  @Column({ type: 'enum', enum: RetrievalEventStatus, enumName: 'retrieval_event_status' })
  status!: RetrievalEventStatus;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs!: number | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true }) failureCode!:
    string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @OneToMany(() => RetrievalEventChunk, (c) => c.retrievalEvent) chunks!: RetrievalEventChunk[];
}
