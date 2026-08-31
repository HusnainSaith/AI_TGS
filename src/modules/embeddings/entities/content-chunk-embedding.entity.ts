import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { ContentChunk } from '../../knowledge-base/entities/content-chunk.entity';
import { EmbeddingStatus } from '../embedding.enums';

@Entity('content_chunk_embeddings')
@Unique(['contentChunkId', 'embeddingConfigVersion'])
@Index(['status'])
@Index(['embeddingConfigVersion'])
@Check('dimension = 1536')
export class ContentChunkEmbedding extends BaseEntity {
  @Column({ name: 'content_chunk_id', type: 'uuid' }) contentChunkId!: string;
  @ManyToOne(() => ContentChunk, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_chunk_id' })
  contentChunk!: ContentChunk;
  @Column({ length: 40 }) provider!: string;
  @Column({ length: 120 }) model!: string;
  @Column({ name: 'model_version', type: 'varchar', length: 120, nullable: true })
  modelVersion!: string | null;
  @Column({ name: 'embedding_config_version', length: 64 }) embeddingConfigVersion!: string;
  @Column({ type: 'integer' }) dimension!: number;
  @Column({ name: 'distance_metric', length: 20 }) distanceMetric!: string;
  @Column({ name: 'content_hash', length: 64 }) contentHash!: string;
  @Column({ type: 'enum', enum: EmbeddingStatus, enumName: 'embedding_status' })
  status!: EmbeddingStatus;
  @Column({ type: 'vector', length: 1536, nullable: true } as never) embedding!: string | null;
  @Column({ name: 'embedded_at', type: 'timestamptz', nullable: true }) embeddedAt!: Date | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'usage_metadata', type: 'jsonb', nullable: true })
  usageMetadata!: Record<string, unknown> | null;
}
