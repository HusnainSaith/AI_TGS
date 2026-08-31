export type BillingProviderErrorCode =
  | 'BILLING_PROVIDER_NOT_CONFIGURED'
  | 'BILLING_PROVIDER_AUTH_FAILED'
  | 'BILLING_PROVIDER_RATE_LIMITED'
  | 'BILLING_PROVIDER_TIMEOUT'
  | 'BILLING_PROVIDER_ERROR'
  | 'BILLING_INVALID_WEBHOOK_SIGNATURE'
  | 'BILLING_PROVIDER_OPERATION_UNSUPPORTED';

export class BillingProviderError extends Error {
  constructor(
    readonly code: BillingProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}
