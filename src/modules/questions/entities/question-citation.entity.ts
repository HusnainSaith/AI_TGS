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
import { RetrievalEvent } from '../../retrieval/entities/retrieval-event.entity';
import { Question } from './question.entity';
@Entity('question_citations')
@Unique(['questionId', 'citationOrder'])
@Index(['questionId'])
@Index(['retrievalEventId'])
@Index(['contentChunkId'])
export class QuestionCitation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;
  @Column({ name: 'retrieval_event_id', type: 'uuid' }) retrievalEventId!: string;
  @ManyToOne(() => RetrievalEvent, { onDelete: 'RESTRICT' })
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
  @Column({ type: 'jsonb' }) locator!: Record<string, unknown>;
  @Column({ name: 'excerpt_hash', length: 64 }) excerptHash!: string;
  @Column({ name: 'retrieval_score', type: 'double precision', nullable: true }) retrievalScore!:
    number | null;
  @Column({ name: 'citation_order', type: 'integer' }) citationOrder!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
