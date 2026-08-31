import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { ExtractionResult, SourceExtractor } from './extraction.types';
const decode = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
@Injectable()
export class DocxExtractorService implements SourceExtractor {
  async extract(content: Buffer): Promise<ExtractionResult> {
    try {
      const result = await mammoth.convertToHtml(
        { buffer: content },
        { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) },
      );
      const blocks: ExtractionResult['blocks'] = [];
      let paragraph = 0;
      let heading: string | undefined;
      for (const match of result.value.matchAll(/<(h[1-6]|p|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
        const tag = match[1]?.toLowerCase();
        const text = decode(match[2] ?? '');
        if (!text) continue;
        paragraph++;
        if (tag?.startsWith('h')) heading = text;
        blocks.push({
          text,
          sectionTitle: heading,
          locator: {
            type: 'DOCX_PARAGRAPH',
            paragraphFrom: paragraph,
            paragraphTo: paragraph,
            ...(heading && { heading }),
          },
        });
      }
      return {
        blocks,
        emptyPageCount: 0,
        ocrRequired: false,
        warnings: result.messages.map((m) => m.message),
      };
    } catch {
      throw new Error('DOCX_EXTRACTION_FAILED');
    }
  }
}
