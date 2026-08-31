import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip = require('jszip'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DocxExtractorService } from '../src/modules/ingestion/extraction/docx-extractor.service';
import { PdfExtractorService } from '../src/modules/ingestion/extraction/pdf-extractor.service';
import { TxtExtractorService } from '../src/modules/ingestion/extraction/txt-extractor.service';
import { ChunkingService } from '../src/modules/ingestion/processing/chunking.service';
import { CompletenessVerifierService } from '../src/modules/ingestion/processing/completeness-verifier.service';
import { TextNormalizerService } from '../src/modules/ingestion/processing/text-normalizer.service';
import { TokenEstimatorService } from '../src/modules/ingestion/processing/token-estimator.service';

const config = new ConfigService({
  ingestion: {
    pdfMinTextCharsPerPage: 10,
    pdfMaxEmptyPageRatio: 0.6,
    chunkTargetTokens: 30,
    chunkMaxTokens: 50,
    chunkMinTokens: 3,
    chunkOverlapTokens: 2,
  },
});
describe('deterministic ingestion processing', () => {
  it('extracts PDF pages and detects empty/scanned PDFs', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const text of ['First page source text', 'Second page source text']) {
      const page = document.addPage();
      page.drawText(text, { font, size: 12 });
    }
    const extractor = new PdfExtractorService(config);
    const result = await extractor.extract(Buffer.from(await document.save()));
    expect(result.pageCount).toBe(2);
    expect(result.blocks.map((b) => b.locator)).toEqual([
      { type: 'PDF_PAGE', pageFrom: 1, pageTo: 1 },
      { type: 'PDF_PAGE', pageFrom: 2, pageTo: 2 },
    ]);
    expect(result.ocrRequired).toBe(false);
    const empty = await PDFDocument.create();
    empty.addPage();
    const scanned = await extractor.extract(Buffer.from(await empty.save()));
    expect(scanned.ocrRequired).toBe(true);
    await expect(extractor.extract(Buffer.from('not-pdf'))).rejects.toThrow(
      'PDF_EXTRACTION_FAILED',
    );
  });
  it('extracts ordered DOCX headings and paragraphs without fake pages', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    );
    zip
      .folder('_rels')!
      .file(
        '.rels',
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      );
    zip
      .folder('word')!
      .file(
        'document.xml',
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Motion</w:t></w:r></w:p><w:p><w:r><w:t>Velocity has direction.</w:t></w:r></w:p></w:body></w:document>`,
      )
      .file(
        'styles.xml',
        `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
      );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await new DocxExtractorService().extract(bytes);
    expect(result.blocks.map((b) => b.text)).toEqual(['Motion', 'Velocity has direction.']);
    expect(result.blocks[1]?.locator).toMatchObject({
      type: 'DOCX_PARAGRAPH',
      paragraphFrom: 2,
      paragraphTo: 2,
      heading: 'Motion',
    });
    await expect(new DocxExtractorService().extract(Buffer.from('bad'))).rejects.toThrow(
      'DOCX_EXTRACTION_FAILED',
    );
  });
  it('extracts UTF-8 TXT blocks with line locators and rejects binary', async () => {
    const result = await new TxtExtractorService().extract(
      Buffer.from('Heading\r\nLine two\r\n\r\nSecond section', 'utf8'),
    );
    expect(result.blocks).toEqual([
      { text: 'Heading\nLine two', locator: { type: 'TEXT_LINES', lineFrom: 1, lineTo: 2 } },
      { text: 'Second section', locator: { type: 'TEXT_LINES', lineFrom: 4, lineTo: 4 } },
    ]);
    await expect(new TxtExtractorService().extract(Buffer.from([1, 0, 2]))).rejects.toThrow(
      'TXT_EXTRACTION_FAILED',
    );
  });
  it('normalizes and produces deterministic hashed overlapping chunks', () => {
    const normalizer = new TextNormalizerService();
    expect(normalizer.normalize(' A\r\n\r\n\r\nB\t C ')).toBe('A\n\nB C');
    const service = new ChunkingService(config, normalizer, new TokenEstimatorService());
    const blocks = [
      {
        text: 'One two three four five six seven eight nine ten.',
        locator: { type: 'TEXT_LINES' as const, lineFrom: 1, lineTo: 1 },
      },
      {
        text: 'Eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen.',
        locator: { type: 'TEXT_LINES' as const, lineFrom: 2, lineTo: 2 },
      },
    ];
    const first = service.chunk(blocks);
    const second = service.chunk(blocks);
    expect(second).toEqual(first);
    expect(first.map((c) => c.chunkOrder)).toEqual(first.map((_, i) => i + 1));
    expect(
      first.every((c) => c.content && c.contentHash.length === 64 && c.estimatedTokenCount <= 50),
    ).toBe(true);
    new CompletenessVerifierService(config).verify(
      blocks.reduce((s, b) => s + b.text.length, 0),
      first,
    );
  });
  it('fails completeness for empty, invalid order, or oversized chunks', () => {
    const verifier = new CompletenessVerifierService(config);
    expect(() => verifier.verify(0, [])).toThrow('EMPTY_DOCUMENT');
    expect(() =>
      verifier.verify(10, [
        {
          content: 'x',
          contentHash: 'a'.repeat(64),
          estimatedTokenCount: 1,
          pageFrom: null,
          pageTo: null,
          sectionTitle: null,
          locatorMetadata: { type: 'TEXT_LINES', lineFrom: 1, lineTo: 1 },
          chunkOrder: 2,
        },
      ]),
    ).toThrow('COMPLETENESS_CHECK_FAILED');
  });
});
