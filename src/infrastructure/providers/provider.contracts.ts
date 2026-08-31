export const AI_GENERATION_PROVIDER = Symbol('AiGenerationProvider');
export interface AiGenerationProvider {
  generateQuestions(input: unknown): Promise<unknown>;
}
export const EMBEDDING_PROVIDER = Symbol('EmbeddingProvider');
export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<readonly number[][]>;
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
