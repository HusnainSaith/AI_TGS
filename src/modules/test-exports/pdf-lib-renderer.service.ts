import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { PdfRenderer, TestRenderModel } from './test-render-model';
import { TestRenderMode } from './test-export.enums';
@Injectable()
export class PdfLibRenderer implements PdfRenderer {
  constructor(private config: ConfigService) {}
  async render(model: TestRenderModel) {
    if (!model.questions.length)
      throw new BadRequestException('PDF render model requires questions');
    const doc = await PDFDocument.create();
    doc.setTitle(model.test.title);
    doc.setSubject(model.curriculum.subject);
    doc.setCreator(model.teacher.displayName);
    doc.setProducer('AI Test Generation System');
    doc.setCreationDate(model.test.finalizedAt);
    doc.setModificationDate(model.test.finalizedAt);
    const regular = await doc.embedFont(StandardFonts.Helvetica),
      bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const size = { width: 595.28, height: 841.89 },
      margin = 50,
      bottom = 55;
    let page: PDFPage,
      y = 0;
    const addPage = () => {
      page = doc.addPage([size.width, size.height]);
      y = size.height - margin;
    };
    addPage();
    const ensure = (height: number) => {
      if (y - height < bottom) addPage();
    };
    const text = (value: string, x: number, fontSize = 10, font: PDFFont = regular) => {
      const safe = this.safe(value, font, fontSize);
      const max = size.width - margin - x;
      for (const line of this.wrap(safe, font, fontSize, max)) {
        ensure(fontSize + 5);
        page.drawText(line, { x, y, font, size: fontSize, color: rgb(0, 0, 0) });
        y -= fontSize + 5;
      }
    };
    const center = (value: string, fontSize: number, font: PDFFont) => {
      const safe = this.safe(value, font, fontSize);
      page.drawText(safe, {
        x: Math.max(margin, (size.width - font.widthOfTextAtSize(safe, fontSize)) / 2),
        y,
        font,
        size: fontSize,
      });
      y -= fontSize + 8;
    };
    center(model.institution.name ?? 'AI Test Generation System', 14, bold);
    center(
      model.mode === TestRenderMode.ANSWER_KEY
        ? `${model.test.title} - ANSWER KEY`
        : model.test.title,
      16,
      bold,
    );
    text(
      `Board: ${model.curriculum.board}    Class: ${model.curriculum.className}    Section: ${model.curriculum.section ?? 'All'}`,
      margin,
      10,
    );
    text(
      `Subject: ${model.curriculum.subject}    Duration: ${model.test.durationMinutes ?? '-'} minutes    Total Marks: ${model.test.totalMarks}`,
      margin,
      10,
    );
    if (model.mode === TestRenderMode.QUESTION_PAPER) {
      y -= 4;
      text(
        'Name: __________________________    Roll No: ______________    Date: ______________',
        margin,
        10,
      );
      if (model.test.instructions) {
        y -= 6;
        text('Instructions', margin, 11, bold);
        text(model.test.instructions, margin, 10);
      }
    }
    y -= 10;
    for (const q of model.questions) {
      ensure(45);
      text(
        `${q.number}. ${q.text}  [${q.marks} mark${q.marks === 1 ? '' : 's'}]`,
        margin,
        11,
        bold,
      );
      for (const option of q.options) text(`   ${option.label}. ${option.text}`, margin + 10, 10);
      if (model.mode === TestRenderMode.ANSWER_KEY) {
        text(`   Correct answer: ${q.answer ?? 'Answer unavailable'}`, margin + 10, 10, bold);
        if (q.explanation) text(`   Explanation: ${q.explanation}`, margin + 10, 9);
      } else if (!q.options.length) {
        text(
          '   ______________________________________________________________________',
          margin,
          9,
        );
        text(
          '   ______________________________________________________________________',
          margin,
          9,
        );
      }
      y -= 7;
    }
    const pages = doc.getPages();
    pages.forEach((p, index) => {
      const label = `Page ${index + 1} of ${pages.length}`;
      p.drawText(label, {
        x: (size.width - regular.widthOfTextAtSize(label, 9)) / 2,
        y: 25,
        font: regular,
        size: 9,
        color: rgb(0.3, 0.3, 0.3),
      });
    });
    const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
    const buffer = Buffer.from(bytes);
    const max = this.config.get<number>('pdf.maxFileSizeBytes') ?? 10 * 1024 * 1024;
    if (buffer.length > max) throw new BadRequestException('PDF exceeds configured size limit');
    return buffer;
  }
  private wrap(value: string, font: PDFFont, size: number, max: number) {
    const result: string[] = [];
    for (const paragraph of value.replace(/\r/g, '').split('\n')) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= max) line = candidate;
        else {
          if (line) result.push(line);
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > max && rest.length > 1) {
            let cut = rest.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > max) cut--;
            result.push(rest.slice(0, cut));
            rest = rest.slice(cut);
          }
          line = rest;
        }
      }
      result.push(line || ' ');
    }
    return result;
  }
  private safe(value: string, font: PDFFont, size: number) {
    return [...value]
      .map((char) => {
        try {
          font.widthOfTextAtSize(char, size);
          return char;
        } catch {
          return '?';
        }
      })
      .join('');
  }
}
