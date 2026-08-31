import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ContentChunk } from '../../knowledge-base/entities/content-chunk.entity';
import { DocumentVersion } from '../../knowledge-base/entities/document-version.entity';
import { RetrievalEvent } from './retrieval-event.entity';
@Entity('retrieval_event_chunks')
@Unique(['retrievalEventId', 'rank'])
@Index(['retrievalEventId'])
@Index(['contentChunkId'])
@Index(['documentVersionId'])
export class RetrievalEventChunk {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'retrieval_event_id', type: 'uuid' }) retrievalEventId!: string;
  @ManyToOne(() => RetrievalEvent, (e) => e.chunks, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'retrieval_event_id' })
  retrievalEvent!: RetrievalEvent;
  @Column({ name: 'content_chunk_id', type: 'uuid' }) contentChunkId!: string;
  @ManyToOne(() => ContentChunk, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'content_chunk_id' })
  contentChunk!: ContentChunk;
  @Column({ name: 'document_version_id', type: 'uuid' }) documentVersionId!: string;
  @ManyToOne(() => DocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion!: DocumentVersion;
  @Column({ length: 20 }) label!: string;
  @Column({ type: 'integer' }) rank!: number;
  @Column({ name: 'vector_score', type: 'double precision' }) vectorScore!: number;
  @Column({ name: 'keyword_score', type: 'double precision' }) keywordScore!: number;
  @Column({ name: 'hybrid_score', type: 'double precision' }) hybridScore!: number;
  @Column({ name: 'estimated_tokens', type: 'integer' }) estimatedTokens!: number;
  @Column({ name: 'content_hash', length: 64 }) contentHash!: string;
  @Column({ name: 'locator_snapshot', type: 'jsonb' }) locatorSnapshot!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
