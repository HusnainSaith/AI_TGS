import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionResult, SourceExtractor } from './extraction.types';
@Injectable()
export class PdfExtractorService implements SourceExtractor {
  constructor(private readonly config: ConfigService) {}
  async extract(content: Buffer): Promise<ExtractionResult> {
    try {
      // Keeps the ESM-only PDF.js build behind its native runtime loader in this CommonJS Nest app.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string,
      ) => Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>;
      const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
      const document = await pdfjs.getDocument({
        data: new Uint8Array(content),
      }).promise;
      if (document.numPages > (this.config.get<number>('ingestion.maxPdfPages') ?? 1000))
        throw new Error('PARSER_RESOURCE_LIMIT_EXCEEDED');
      const blocks: ExtractionResult['blocks'] = [];
      let emptyPageCount = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length < this.config.getOrThrow<number>('ingestion.pdfMinTextCharsPerPage'))
          emptyPageCount++;
        if (text)
          blocks.push({
            text,
            locator: { type: 'PDF_PAGE', pageFrom: pageNumber, pageTo: pageNumber },
          });
      }
      const ratio = document.numPages ? emptyPageCount / document.numPages : 1;
      const total = blocks.reduce((sum, b) => sum + b.text.length, 0);
      return {
        blocks,
        pageCount: document.numPages,
        emptyPageCount,
        ocrRequired:
          total === 0 || ratio > this.config.getOrThrow<number>('ingestion.pdfMaxEmptyPageRatio'),
        warnings: [],
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'PARSER_RESOURCE_LIMIT_EXCEEDED') throw error;
      throw new Error('PDF_EXTRACTION_FAILED', { cause: error });
    }
  }
}
