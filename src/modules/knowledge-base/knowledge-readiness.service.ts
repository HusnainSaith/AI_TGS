import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CurriculumStatus } from '../curriculum/curriculum-status.enum';
import { EmbeddingConfigService } from '../embeddings/embedding-config.service';
import { EmbeddingStatus } from '../embeddings/embedding.enums';
import { ContentChunkEmbedding } from '../embeddings/entities/content-chunk-embedding.entity';
import { ContentChunk } from './entities/content-chunk.entity';
import { DocumentTopicMapping } from './entities/document-topic-mapping.entity';
import { DocumentVersion } from './entities/document-version.entity';
import {
  ExtractionStatus,
  KnowledgeDocumentStatus,
  MalwareScanStatus,
  MappingStatus,
  ReadinessBlocker,
} from './enums/knowledge-base.enums';

export interface ReadinessResult {
  mappingReady: boolean;
  reviewReady: boolean;
  publicationReady: boolean;
  mappingBlockers: ReadinessBlocker[];
  reviewBlockers: ReadinessBlocker[];
  publicationBlockers: ReadinessBlocker[];
  blockers: ReadinessBlocker[];
}
@Injectable()
export class KnowledgeReadinessService {
  constructor(
    @InjectRepository(ContentChunk) private chunks: Repository<ContentChunk>,
    @InjectRepository(DocumentTopicMapping) private mappings: Repository<DocumentTopicMapping>,
    @InjectRepository(ContentChunkEmbedding)
    private embeddings: Repository<ContentChunkEmbedding>,
    private embeddingConfig: EmbeddingConfigService,
  ) {}
  async evaluate(version: DocumentVersion, manager?: EntityManager): Promise<ReadinessResult> {
    const chunksRepository = manager?.getRepository(ContentChunk) ?? this.chunks;
    const mappingsRepository = manager?.getRepository(DocumentTopicMapping) ?? this.mappings;
    const embeddingsRepository = manager?.getRepository(ContentChunkEmbedding) ?? this.embeddings;
    const mapping: ReadinessBlocker[] = [];
    const review: ReadinessBlocker[] = [];
    if (version.document.status === KnowledgeDocumentStatus.ARCHIVED)
      mapping.push(ReadinessBlocker.DOCUMENT_ARCHIVED);
    if (version.archivedAt) mapping.push(ReadinessBlocker.VERSION_ARCHIVED);
    if (version.extractionStatus !== ExtractionStatus.COMPLETED)
      mapping.push(ReadinessBlocker.EXTRACTION_NOT_COMPLETE);
    const count = await chunksRepository.countBy({ documentVersionId: version.id });
    if (!count) mapping.push(ReadinessBlocker.NO_CONTENT_CHUNKS);
    if (version.document.rightsMetadata.permissionConfirmed !== true)
      review.push(ReadinessBlocker.RIGHTS_NOT_CONFIRMED);
    const all = await mappingsRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.board', 'board')
      .leftJoinAndSelect('m.curriculumClass', 'class')
      .leftJoinAndSelect('m.subject', 'subject')
      .leftJoinAndSelect('m.chapter', 'chapter')
      .leftJoinAndSelect('m.topic', 'topic')
      .where('m.documentVersionId=:id AND m.status != :archived', {
        id: version.id,
        archived: MappingStatus.ARCHIVED,
      })
      .getMany();
    if (!all.length) review.push(ReadinessBlocker.NO_CURRICULUM_MAPPING);
    const approved = all.filter((m) => m.status === MappingStatus.APPROVED);
    if (all.length && !approved.length) review.push(ReadinessBlocker.MAPPING_PENDING_APPROVAL);
    if (
      approved.some((m) =>
        [m.board, m.curriculumClass, m.subject, m.chapter, m.topic].some(
          (x) => x && x.status !== CurriculumStatus.ACTIVE,
        ),
      )
    )
      review.push(ReadinessBlocker.CURRICULUM_ARCHIVED);
    review.unshift(...mapping);
    const publication = [...review];
    if (
      version.malwareScanStatus === MalwareScanStatus.NOT_SCANNED ||
      version.malwareScanStatus === MalwareScanStatus.PENDING ||
      version.malwareScanStatus === MalwareScanStatus.SCANNING
    )
      publication.push(ReadinessBlocker.MALWARE_NOT_SCANNED);
    if (version.malwareScanStatus === MalwareScanStatus.FAILED)
      publication.push(ReadinessBlocker.MALWARE_SCAN_FAILED);
    if (version.malwareScanStatus === MalwareScanStatus.INFECTED)
      publication.push(ReadinessBlocker.MALWARE_DETECTED);
    const active = this.embeddingConfig.active();
    if (!active.configured) publication.push(ReadinessBlocker.EMBEDDING_PROVIDER_NOT_CONFIGURED);
    try {
      const rows = await embeddingsRepository
        .createQueryBuilder('embedding')
        .innerJoin(ContentChunk, 'chunk', 'chunk.id=embedding.contentChunkId')
        .where('chunk.documentVersionId=:id', { id: version.id })
        .getMany();
      const activeRows = rows.filter(
        (row) =>
          row.embeddingConfigVersion === active.configVersion && row.dimension === active.dimension,
      );
      const chunks = await chunksRepository.findBy({ documentVersionId: version.id });
      const chunkHashes = new Map(chunks.map((chunk) => [chunk.id, chunk.contentHash]));
      const completed = activeRows.filter(
        (row) =>
          row.status === EmbeddingStatus.COMPLETED &&
          row.contentHash === chunkHashes.get(row.contentChunkId),
      ).length;
      if (rows.some((row) => row.embeddingConfigVersion !== active.configVersion))
        publication.push(ReadinessBlocker.EMBEDDING_CONFIG_MISMATCH);
      if (
        activeRows.some(
          (row) =>
            row.status === EmbeddingStatus.STALE ||
            row.contentHash !== chunkHashes.get(row.contentChunkId),
        )
      )
        publication.push(ReadinessBlocker.EMBEDDINGS_STALE);
      if (activeRows.some((row) => row.status === EmbeddingStatus.FAILED))
        publication.push(ReadinessBlocker.EMBEDDINGS_FAILED);
      if (completed === 0 && count > 0) publication.push(ReadinessBlocker.EMBEDDINGS_MISSING);
      else if (completed < count) publication.push(ReadinessBlocker.EMBEDDINGS_PARTIAL);
    } catch (error) {
      const databaseError = error as { code?: string };
      if (databaseError.code !== '42P01') throw error;
      publication.push(ReadinessBlocker.EMBEDDINGS_MISSING);
    }
    const uniq = (xs: ReadinessBlocker[]) => [...new Set(xs)];
    return {
      mappingReady: !mapping.length,
      reviewReady: !review.length,
      publicationReady: !publication.length,
      mappingBlockers: uniq(mapping),
      reviewBlockers: uniq(review),
      publicationBlockers: uniq(publication),
      blockers: uniq(publication),
    };
  }
}
