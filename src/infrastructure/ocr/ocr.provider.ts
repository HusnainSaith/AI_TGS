import { Injectable } from '@nestjs/common';
export const OCR_PROVIDER = Symbol('OcrProvider');
export interface OcrPage {
  pageNumber: number;
  text: string;
}
export interface OcrProvider {
  readonly available: boolean;
  extractPdf(content: Buffer): Promise<OcrPage[]>;
}
@Injectable()
export class UnconfiguredOcrProvider implements OcrProvider {
  readonly available = false;
  extractPdf(content: Buffer): Promise<OcrPage[]> {
    void content;
    return Promise.reject(new Error('OCR_PROVIDER_NOT_CONFIGURED'));
  }
}
