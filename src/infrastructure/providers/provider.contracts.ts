export const AI_GENERATION_PROVIDER = Symbol('AiGenerationProvider');
export interface AiGenerationProvider {
  generateQuestions(input: unknown): Promise<unknown>;
}
export const EMBEDDING_PROVIDER = Symbol('EmbeddingProvider');
export interface EmbeddingModelInfo {
  provider: string;
  model: string;
  dimension: number;
  version?: string;
}
export interface EmbeddingUsage {
  inputTokens?: number;
  totalTokens?: number;
}
export interface EmbeddingResult extends EmbeddingModelInfo {
  vector: readonly number[];
  usage?: EmbeddingUsage;
  providerRequestId?: string;
  latencyMs: number;
}
export interface EmbeddingProvider {
  readonly providerName: string;
  getModelInfo(): EmbeddingModelInfo;
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: readonly string[]): Promise<readonly EmbeddingResult[]>;
}
export const EMAIL_PROVIDER = Symbol('EmailProvider');
export interface EmailProvider {
  send(input: { to: string; template: string; variables: Record<string, string> }): Promise<void>;
}
export const PAYMENT_PROVIDER = Symbol('PaymentProvider');
export interface PaymentProvider {
  createCheckout(input: unknown): Promise<unknown>;
  verifyWebhook(payload: Buffer, signature: string): Promise<unknown>;
}
