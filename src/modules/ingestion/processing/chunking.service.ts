import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { LocatorMetadata } from '../../knowledge-base/entities/content-chunk.entity';
import { ExtractedBlock } from '../extraction/extraction.types';
import { TextNormalizerService } from './text-normalizer.service';
import { TokenEstimatorService } from './token-estimator.service';
export interface PreparedChunk {
  content: string;
  contentHash: string;
  estimatedTokenCount: number;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
  locatorMetadata: LocatorMetadata;
  chunkOrder: number;
}
@Injectable()
export class ChunkingService {
  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: TextNormalizerService,
    private readonly tokens: TokenEstimatorService,
  ) {}
  chunk(input: ExtractedBlock[]): PreparedChunk[] {
    const max = this.config.getOrThrow<number>('ingestion.chunkMaxTokens');
    const target = this.config.getOrThrow<number>('ingestion.chunkTargetTokens');
    const min = this.config.getOrThrow<number>('ingestion.chunkMinTokens');
    const overlap = this.config.getOrThrow<number>('ingestion.chunkOverlapTokens');
    const expanded: ExtractedBlock[] = [];
    for (const block of input) {
      const text = this.normalizer.normalize(block.text);
      if (!text) continue;
      const words = text.split(/\s+/);
      const wordLimit = Math.max(1, max * 3);
      if (this.tokens.estimate(text) <= max) expanded.push({ ...block, text });
      else
        for (let i = 0; i < words.length; i += wordLimit)
          expanded.push({ ...block, text: words.slice(i, i + wordLimit).join(' ') });
    }
    const groups: ExtractedBlock[][] = [];
    let current: ExtractedBlock[] = [];
    for (const block of expanded) {
      const candidate = [...current, block].map((b) => b.text).join('\n\n');
      if (current.length && this.tokens.estimate(candidate) > target) {
        groups.push(current);
        current = [block];
      } else current.push(block);
    }
    if (current.length) groups.push(current);
    const chunks: PreparedChunk[] = [];
    let previousTail = '';
    for (const group of groups) {
      const content = this.normalizer.normalize(
        [previousTail, ...group.map((b) => b.text)].filter(Boolean).join('\n\n'),
      );
      if (this.tokens.estimate(content) < min && chunks.length) {
        const prior = chunks[chunks.length - 1];
        if (prior && this.tokens.estimate(`${prior.content}\n\n${content}`) <= max) {
          prior.content = this.normalizer.normalize(`${prior.content}\n\n${content}`);
          prior.contentHash = createHash('sha256').update(prior.content).digest('hex');
          prior.estimatedTokenCount = this.tokens.estimate(prior.content);
          continue;
        }
      }
      const first = group[0]!,
        last = group[group.length - 1]!;
      const locator = this.mergeLocator(first.locator, last.locator);
      chunks.push({
        content,
        contentHash: createHash('sha256').update(content).digest('hex'),
        estimatedTokenCount: this.tokens.estimate(content),
        pageFrom: locator.type === 'PDF_PAGE' ? locator.pageFrom : null,
        pageTo: locator.type === 'PDF_PAGE' ? locator.pageTo : null,
        sectionTitle: last.sectionTitle ?? first.sectionTitle ?? null,
        locatorMetadata: locator,
        chunkOrder: chunks.length + 1,
      });
      const words = content.split(/\s+/);
      previousTail = words.slice(-Math.max(0, overlap * 3)).join(' ');
    }
    return chunks;
  }
  private mergeLocator(first: LocatorMetadata, last: LocatorMetadata): LocatorMetadata {
    if (first.type === 'PDF_PAGE' && last.type === 'PDF_PAGE')
      return { type: 'PDF_PAGE', pageFrom: first.pageFrom, pageTo: last.pageTo };
    if (first.type === 'DOCX_PARAGRAPH' && last.type === 'DOCX_PARAGRAPH')
      return {
        type: 'DOCX_PARAGRAPH',
        paragraphFrom: first.paragraphFrom,
        paragraphTo: last.paragraphTo,
        ...(last.heading && { heading: last.heading }),
      };
    if (first.type === 'TEXT_LINES' && last.type === 'TEXT_LINES')
      return { type: 'TEXT_LINES', lineFrom: first.lineFrom, lineTo: last.lineTo };
    return first;
  }
}
