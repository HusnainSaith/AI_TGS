import { Injectable } from '@nestjs/common';
import { ExtractionResult, SourceExtractor } from './extraction.types';
@Injectable()
export class TxtExtractorService implements SourceExtractor {
  extract(content: Buffer): Promise<ExtractionResult> {
    if (content.includes(0)) return Promise.reject(new Error('TXT_EXTRACTION_FAILED'));
    const decoded = content.toString('utf8');
    if (decoded.includes('\uFFFD')) return Promise.reject(new Error('TXT_EXTRACTION_FAILED'));
    const lines = decoded.replace(/\r\n?/g, '\n').split('\n');
    const blocks: ExtractionResult['blocks'] = [];
    let start = 0;
    let collected: string[] = [];
    const flush = (end: number) => {
      const text = collected.join('\n').trim();
      if (text)
        blocks.push({ text, locator: { type: 'TEXT_LINES', lineFrom: start + 1, lineTo: end } });
      collected = [];
    };
    lines.forEach((line, index) => {
      if (!collected.length && line.trim()) start = index;
      if (!line.trim() && collected.length) flush(index);
      else if (line.trim()) collected.push(line);
    });
    if (collected.length) flush(lines.length);
    return Promise.resolve({ blocks, emptyPageCount: 0, ocrRequired: false, warnings: [] });
  }
}
