import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { TenantScope } from '../enums/knowledge-base.enums';
import { DocumentVersion } from './document-version.entity';

export type LocatorMetadata =
  | { type: 'PDF_PAGE'; pageFrom: number; pageTo: number }
  | { type: 'DOCX_PARAGRAPH'; paragraphFrom: number; paragraphTo: number; heading?: string }
  | { type: 'TEXT_LINES'; lineFrom: number; lineTo: number };

@Entity('content_chunks')
@Unique(['documentVersionId', 'chunkOrder'])
@Index(['documentVersionId'])
@Index(['tenantScope'])
@Index(['schoolId'])
@Index(['contentHash'])
@Index(['createdAt'])
@Check('chunk_order > 0')
@Check('length(btrim(content)) > 0')
@Check('estimated_token_count > 0')
@Check('page_from IS NULL OR page_from > 0')
@Check('page_to IS NULL OR page_to >= page_from')
export class ContentChunk extends BaseEntity {
  @Column({ name: 'document_version_id', type: 'uuid' }) documentVersionId!: string;
  @ManyToOne(() => DocumentVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion!: DocumentVersion;
  @Column({ name: 'tenant_scope', type: 'enum', enum: TenantScope, enumName: 'kb_tenant_scope' })
  tenantScope!: TenantScope;
  @Column({ name: 'school_id', type: 'uuid', nullable: true }) schoolId!: string | null;
  @Column({ name: 'board_id', type: 'uuid', nullable: true }) boardId!: string | null;
  @Column({ name: 'class_id', type: 'uuid', nullable: true }) classId!: string | null;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true }) subjectId!: string | null;
  @Column({ name: 'chapter_id', type: 'uuid', nullable: true }) chapterId!: string | null;
  @Column({ name: 'topic_id', type: 'uuid', nullable: true }) topicId!: string | null;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'content_hash', length: 64 }) contentHash!: string;
  @Column({ name: 'estimated_token_count', type: 'integer' }) estimatedTokenCount!: number;
  @Column({ name: 'page_from', type: 'integer', nullable: true }) pageFrom!: number | null;
  @Column({ name: 'page_to', type: 'integer', nullable: true }) pageTo!: number | null;
  @Column({ name: 'section_title', type: 'text', nullable: true }) sectionTitle!: string | null;
  @Column({ name: 'locator_metadata', type: 'jsonb' }) locatorMetadata!: LocatorMetadata;
  @Column({ name: 'chunk_order', type: 'integer' }) chunkOrder!: number;
}
