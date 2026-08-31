import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingWebhookEvent,
  PaymentProvider,
} from '../../infrastructure/providers/provider.contracts';
import { BillingProviderError } from './billing-provider.error';

type Timestamp = { seconds: number; nanos?: number };
interface SafepayEvent {
  token: string;
  version: string;
  type: string;
  created_at: Timestamp;
  data: {
    id?: string;
    plan_id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    current_period_start_date?: Timestamp;
    current_period_end_date?: Timestamp;
    transaction_id?: string;
    transaction_status?: string;
    tracker?: string;
    reference?: string;
  };
}

@Injectable()
export class SafepayPaymentProvider implements PaymentProvider {
  readonly name = 'safepay';
  readonly requiresCustomer = false;
  private readonly environment: 'sandbox' | 'production';
  private readonly secret: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.environment =
      config.get<'sandbox' | 'production'>('billing.safepay.environment') ?? 'sandbox';
    this.secret = config.get<string>('billing.safepay.secretKey') ?? '';
    this.webhookSecret = config.get<string>('billing.safepay.webhookSecret') ?? '';
    this.timeoutMs = config.get<number>('billing.safepay.timeoutMs') ?? 15000;
    this.baseUrl =
      this.environment === 'sandbox'
        ? 'https://sandbox.api.getsafepay.com'
        : 'https://api.getsafepay.com';
  }

  createCustomer() {
    return Promise.resolve(null);
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }) {
    const auth = await this.request<{ data: string }>('/client/passport/v1/token', {
      method: 'POST',
      body: '{}',
    });
    if (!auth.data)
      throw new BillingProviderError(
        'BILLING_PROVIDER_ERROR',
        'Safepay returned no authentication token',
      );
    const host =
      this.environment === 'sandbox'
        ? 'https://sandbox.api.getsafepay.com/checkout'
        : 'https://getsafepay.com/checkout';
    const query = new URLSearchParams({
      plan_id: input.priceId,
      auth_token: auth.data,
      env: this.environment,
      cancel_url: input.cancelUrl,
      redirect_url: input.successUrl,
      reference: input.idempotencyKey,
    });
    return {
      id: input.idempotencyKey,
      url: `${host}?${query.toString()}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  createBillingPortalSession() {
    return this.unsupported<{ url: string }>('Safepay billing portal is not documented');
  }
  async cancelSubscription(id: string) {
    await this.request(`/subscriptions/v1/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
  }
  changeSubscriptionPlan(_id: string, _priceId: string) {
    void _id;
    void _priceId;
    return this.unsupported<void>('Safepay in-place plan changes are not documented');
  }
  getSubscription(_id: string) {
    void _id;
    return this.unsupported<Omit<BillingWebhookEvent, 'id' | 'type'>>(
      'Safepay subscription retrieval is not documented in the current public API',
    );
  }

  verifyAndParseWebhook(payload: Buffer, signature: string): BillingWebhookEvent {
    if (!this.webhookSecret)
      throw new BillingProviderError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Safepay webhook secret is not configured',
      );
    const expected = Buffer.from(
      createHmac('sha512', this.webhookSecret).update(payload).digest('hex'),
    );
    const provided = Buffer.from(signature || '');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw new BillingProviderError(
        'BILLING_INVALID_WEBHOOK_SIGNATURE',
        'Invalid Safepay webhook signature',
      );
    let event: SafepayEvent;
    try {
      event = JSON.parse(payload.toString('utf8')) as SafepayEvent;
    } catch {
      throw new BillingProviderError('BILLING_PROVIDER_ERROR', 'Malformed Safepay webhook');
    }
    if (
      !event.token ||
      event.version !== '2.0.0' ||
      !event.type ||
      !event.data ||
      !event.created_at?.seconds
    )
      throw new BillingProviderError('BILLING_PROVIDER_ERROR', 'Invalid Safepay webhook schema');
    const d = event.data;
    const types: Record<string, BillingWebhookEvent['type']> = {
      'subscription.created': 'SUBSCRIPTION_CREATED',
      'subscription.canceled': 'SUBSCRIPTION_CANCELED',
      'subscription.ended': 'SUBSCRIPTION_EXPIRED',
      'subscription.resumed': 'SUBSCRIPTION_ACTIVATED',
      'subscription.payment.succeeded': 'SUBSCRIPTION_RENEWED',
      'subscription.payment.failed': 'PAYMENT_FAILED',
      'payment.succeeded': 'PAYMENT_SUCCEEDED',
      'payment.failed': 'PAYMENT_FAILED',
    };
    return {
      id: event.token,
      type: types[event.type] ?? 'UNKNOWN',
      occurredAt: this.date(event.created_at),
      subscriptionId: d.id,
      checkoutSessionId: d.reference ?? d.tracker,
      priceId: d.plan_id,
      status: d.status,
      periodStart: d.current_period_start_date ? this.date(d.current_period_start_date) : undefined,
      periodEnd: d.current_period_end_date ? this.date(d.current_period_end_date) : undefined,
      transaction:
        d.transaction_id && d.amount !== undefined && d.currency
          ? {
              id: d.transaction_id,
              amountMinor: d.amount,
              currency: d.currency,
              status: d.transaction_status ?? 'UNKNOWN',
            }
          : undefined,
    };
  }

  private date(value: Timestamp) {
    return new Date(value.seconds * 1000 + Math.floor((value.nanos ?? 0) / 1_000_000));
  }
  private unsupported<T>(message: string): Promise<T> {
    return Promise.reject(
      new BillingProviderError('BILLING_PROVIDER_OPERATION_UNSUPPORTED', message),
    );
  }
  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    if (!this.secret)
      throw new BillingProviderError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Safepay secret key is not configured',
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-sfpy-merchant-secret': this.secret,
        },
      });
      if (response.status === 401 || response.status === 403)
        throw new BillingProviderError(
          'BILLING_PROVIDER_AUTH_FAILED',
          'Safepay authentication failed',
        );
      if (response.status === 429)
        throw new BillingProviderError(
          'BILLING_PROVIDER_RATE_LIMITED',
          'Safepay rate limit reached',
        );
      if (!response.ok)
        throw new BillingProviderError(
          'BILLING_PROVIDER_ERROR',
          `Safepay request failed (${response.status})`,
        );
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BillingProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new BillingProviderError('BILLING_PROVIDER_TIMEOUT', 'Safepay request timed out');
      throw new BillingProviderError('BILLING_PROVIDER_ERROR', 'Safepay request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
