import { LocatorMetadata } from '../../knowledge-base/entities/content-chunk.entity';
export interface ExtractedBlock {
  text: string;
  locator: LocatorMetadata;
  sectionTitle?: string;
}
export interface ExtractionResult {
  blocks: ExtractedBlock[];
  pageCount?: number;
  emptyPageCount: number;
  ocrRequired: boolean;
  warnings: string[];
}
export interface SourceExtractor {
  extract(content: Buffer): Promise<ExtractionResult>;
}
