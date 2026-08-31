import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PreparedChunk } from './chunking.service';
@Injectable()
export class CompletenessVerifierService {
  constructor(private readonly config: ConfigService) {}
  verify(normalizedCharacters: number, chunks: PreparedChunk[]): void {
    if (normalizedCharacters <= 0) throw new Error('EMPTY_DOCUMENT');
    if (!chunks.length) throw new Error('COMPLETENESS_CHECK_FAILED');
    const max = this.config.getOrThrow<number>('ingestion.chunkMaxTokens');
    let previous = 0;
    for (const chunk of chunks) {
      if (
        chunk.chunkOrder !== previous + 1 ||
        !chunk.contentHash ||
        !chunk.locatorMetadata ||
        chunk.estimatedTokenCount > max
      )
        throw new Error('COMPLETENESS_CHECK_FAILED');
      previous = chunk.chunkOrder;
    }
    const aggregate = chunks.reduce((sum, c) => sum + c.content.replace(/\s/g, '').length, 0);
    if (aggregate < Math.max(1, Math.floor(normalizedCharacters * 0.5)))
      throw new Error('COMPLETENESS_CHECK_FAILED');
  }
}
