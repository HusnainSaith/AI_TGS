import { Module } from '@nestjs/common';
import { OCR_PROVIDER, UnconfiguredOcrProvider } from './ocr.provider';
@Module({
  providers: [
    UnconfiguredOcrProvider,
    { provide: OCR_PROVIDER, useExisting: UnconfiguredOcrProvider },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}
