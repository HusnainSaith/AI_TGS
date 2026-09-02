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
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}
export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(input: EmailMessage): Promise<void>;
  verify(): Promise<boolean>;
}
export const PAYMENT_PROVIDER = Symbol('PaymentProvider');
export type BillingOwnerType = 'USER' | 'SCHOOL';
export type NormalizedBillingEventType =
  | 'CHECKOUT_COMPLETED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_CANCEL_SCHEDULED'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'INVOICE_PAID'
  | 'INVOICE_PAYMENT_FAILED'
  | 'PLAN_CHANGED'
  | 'UNKNOWN';
export interface BillingWebhookEvent {
  id: string;
  type: NormalizedBillingEventType;
  occurredAt: Date;
  customerId?: string;
  subscriptionId?: string;
  checkoutSessionId?: string;
  priceId?: string;
  status?: string;
  periodStart?: Date;
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  transaction?: { id: string; amountMinor: number; currency: string; status: string };
}
export type NormalizedBillingSubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'UNPAID'
  | 'CANCELED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'ENDED'
  | 'PAUSED';
export interface BillingSubscription {
  providerSubscriptionId: string;
  status: NormalizedBillingSubscriptionStatus;
  providerPlanId?: string;
  providerCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date;
  providerUpdatedAt: Date;
}
export type PaymentProviderCapability = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED';
export interface PaymentProviderCapabilities {
  checkout: PaymentProviderCapability;
  customerCreation: PaymentProviderCapability;
  portal: PaymentProviderCapability;
  cancellation: PaymentProviderCapability;
  planChange: PaymentProviderCapability;
  subscriptionRetrieval: PaymentProviderCapability;
  reconciliation: PaymentProviderCapability;
}
export interface PaymentProvider {
  readonly name: string;
  readonly requiresCustomer: boolean;
  readonly capabilities: PaymentProviderCapabilities;
  createCustomer(input: {
    ownerType: BillingOwnerType;
    ownerId: string;
    email: string;
  }): Promise<{ id: string } | null>;
  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string; expiresAt: Date }>;
  createBillingPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
  cancelSubscription(id: string): Promise<void>;
  changeSubscriptionPlan(id: string, priceId: string): Promise<void>;
  getSubscription(id: string): Promise<BillingSubscription>;
  verifyAndParseWebhook(payload: Buffer, signature: string): BillingWebhookEvent;
}
