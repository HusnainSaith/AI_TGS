import { EmbeddingErrorCode } from './embedding.enums';

export class EmbeddingProviderError extends Error {
  constructor(
    readonly code: EmbeddingErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
