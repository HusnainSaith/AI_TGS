import { BadRequestException } from '@nestjs/common';
import { FileValidationService } from '../src/infrastructure/file-security/file-validation.service';
import { KnowledgeSourceType } from '../src/modules/knowledge-base/enums/knowledge-base.enums';

describe('Knowledge Base file validation', () => {
  const service = new FileValidationService();
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  it('accepts signatures and sanitizes filename metadata', () => {
    const result = service.validate(
      {
        buffer: Buffer.from('%PDF-1.4 synthetic'),
        mimetype: 'application/pdf',
        originalname: '../../unsafe.pdf',
      },
      KnowledgeSourceType.PDF,
      allowed,
    );
    expect(result.originalFilename).toBe('.._.._unsafe.pdf');
  });
  it('rejects spoofed files, binaries, and unsupported source types', () => {
    expect(() =>
      service.validate(
        {
          buffer: Buffer.from('MZ executable'),
          mimetype: 'application/pdf',
          originalname: 'x.pdf',
        },
        KnowledgeSourceType.PDF,
        allowed,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate(
        { buffer: Buffer.from([0, 1, 2]), mimetype: 'text/plain', originalname: 'x.txt' },
        KnowledgeSourceType.TXT,
        allowed,
      ),
    ).toThrow(BadRequestException);
  });
});
