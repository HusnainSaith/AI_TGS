import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { IngestionJob } from '../../ingestion/entities/ingestion-job.entity';
import { ExtractionStatus, MalwareScanStatus } from '../enums/knowledge-base.enums';
import { KnowledgeDocument } from './knowledge-document.entity';
import { ContentChunk } from './content-chunk.entity';
import { DocumentTopicMapping } from './document-topic-mapping.entity';

@Entity('document_versions')
@Unique(['documentId', 'versionNo'])
@Index(['documentId'])
@Index(['checksum'])
@Index(['createdAt'])
@Check('version_no > 0')
@Check('file_size > 0')
export class DocumentVersion extends BaseEntity {
  @Column({ name: 'document_id', type: 'uuid' }) documentId!: string;
  @ManyToOne(() => KnowledgeDocument, (d) => d.versions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document!: KnowledgeDocument;
  @Column({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column({ name: 'storage_key', type: 'text', unique: true }) storageKey!: string;
  @Column({ length: 64 }) checksum!: string;
  @Column({ name: 'mime_type', length: 120 }) mimeType!: string;
  @Column({ name: 'validated_mime_type', length: 120 }) validatedMimeType!: string;
  @Column({ name: 'original_filename', length: 255 }) originalFilename!: string;
  @Column({
    name: 'file_size',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  fileSize!: number;
  @Column({ name: 'page_count', type: 'integer', nullable: true }) pageCount!: number | null;
  @Column({
    name: 'extraction_status',
    type: 'enum',
    enum: ExtractionStatus,
    enumName: 'kb_extraction_status',
    default: ExtractionStatus.PENDING,
  })
  extractionStatus!: ExtractionStatus;
  @Column({
    name: 'malware_scan_status',
    type: 'enum',
    enum: MalwareScanStatus,
    enumName: 'kb_malware_scan_status',
    default: MalwareScanStatus.NOT_SCANNED,
  })
  malwareScanStatus!: MalwareScanStatus;
  @Column({ name: 'malware_scanner_provider', type: 'varchar', length: 80, nullable: true })
  malwareScannerProvider!: string | null;
  @Column({ name: 'malware_scanned_at', type: 'timestamptz', nullable: true })
  malwareScannedAt!: Date | null;
  @Column({ name: 'malware_scan_metadata', type: 'jsonb', nullable: true })
  malwareScanMetadata!: Record<string, unknown> | null;
  @Column({ name: 'malware_error_code', type: 'varchar', length: 80, nullable: true })
  malwareErrorCode!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({
    name: 'publication_embedding_config_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  publicationEmbeddingConfigVersion!: string | null;
  @Column({ name: 'publication_mapping_snapshot', type: 'jsonb', nullable: true })
  publicationMappingSnapshot!: { mappingIds: string[]; publishedAt: string } | null;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt!: Date | null;
  @OneToMany(() => IngestionJob, (j) => j.documentVersion) ingestionJobs!: IngestionJob[];
  @OneToMany(() => ContentChunk, (c) => c.documentVersion) chunks!: ContentChunk[];
  @OneToMany(() => DocumentTopicMapping, (m) => m.documentVersion)
  mappings!: DocumentTopicMapping[];
}
