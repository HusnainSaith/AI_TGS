import { BadRequestException, Injectable } from '@nestjs/common';
import { KnowledgeSourceType } from '../../modules/knowledge-base/enums/knowledge-base.enums';

export interface ValidatedFile {
  mimeType: string;
  originalFilename: string;
}
@Injectable()
export class FileValidationService {
  validate(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    sourceType: KnowledgeSourceType,
    allowed: readonly string[],
  ): ValidatedFile {
    if (!file?.buffer?.length) throw new BadRequestException('A non-empty file is required');
    if (sourceType === KnowledgeSourceType.ADMIN_NOTE)
      throw new BadRequestException('ADMIN_NOTE upload is deferred');
    const expected: Record<string, string> = {
      PDF: 'application/pdf',
      DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      TXT: 'text/plain',
    };
    const mime = expected[sourceType];
    if (!mime || file.mimetype !== mime || !allowed.includes(mime))
      throw new BadRequestException('Unsupported file type');
    let valid = false;
    if (sourceType === KnowledgeSourceType.PDF)
      valid = file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if (sourceType === KnowledgeSourceType.DOCX) {
      const zip =
        file.buffer[0] === 0x50 &&
        file.buffer[1] === 0x4b &&
        [0x03, 0x05, 0x07].includes(file.buffer[2] ?? -1);
      valid =
        zip &&
        file.buffer.includes(Buffer.from('word/')) &&
        file.buffer.includes(Buffer.from('[Content_Types].xml'));
    }
    if (sourceType === KnowledgeSourceType.TXT) {
      const sample = file.buffer.subarray(0, Math.min(file.buffer.length, 8192));
      const executableHeader =
        sample.subarray(0, 2).toString('ascii') === 'MZ' ||
        sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
        sample.subarray(0, 2).toString('ascii') === '#!';
      valid =
        !executableHeader &&
        !sample.includes(0) &&
        sample.toString('utf8').replace(/[\t\n\r\x20-\x7e\u00a0-\uffff]/g, '').length /
          sample.length <
          0.05;
    }
    if (!valid) throw new BadRequestException('File signature does not match declared type');
    const forbidden = '<>:"/\\|?*';
    const originalFilename =
      Array.from(file.originalname)
        .map((character) =>
          character.charCodeAt(0) < 32 || forbidden.includes(character) ? '_' : character,
        )
        .join('')
        .slice(0, 255) || 'upload';
    return { mimeType: mime, originalFilename };
  }
}
