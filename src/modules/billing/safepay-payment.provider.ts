import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingSubscription,
  BillingWebhookEvent,
  NormalizedBillingSubscriptionStatus,
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
interface SafepaySubscriptionResponse {
  data?: {
    subscription?: {
      token?: string;
      plan_id?: string;
      user_id?: string;
      status?: string;
      current_period_start_date?: string;
      current_period_end_date?: string;
      cancel_at_period_end?: boolean;
      canceled_at?: string;
      updated_at?: string;
    };
  };
}

@Injectable()
export class SafepayPaymentProvider implements PaymentProvider {
  readonly name = 'safepay';
  readonly requiresCustomer = false;
  readonly capabilities = {
    checkout: 'SUPPORTED',
    customerCreation: 'UNSUPPORTED',
    portal: 'UNSUPPORTED',
    cancellation: 'SUPPORTED',
    planChange: 'UNSUPPORTED',
    subscriptionRetrieval: 'SUPPORTED',
    reconciliation: 'SUPPORTED',
  } as const;
  private readonly environment: 'sandbox' | 'production';
  private readonly secret: string;
  private readonly webhookSecret: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private passportToken: { value: string; expiresAt: number } | null = null;
  private passportRequest: Promise<string> | null = null;

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
    const authToken = await this.getPassportToken();
    const host =
      this.environment === 'sandbox'
        ? 'https://sandbox.api.getsafepay.com/checkout'
        : 'https://getsafepay.com/checkout';
    const query = new URLSearchParams({
      plan_id: input.priceId,
      auth_token: authToken,
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
    await this.request(`/client/subscriptions/v1/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
  }
  changeSubscriptionPlan(_id: string, _priceId: string) {
    void _id;
    void _priceId;
    return this.unsupported<void>('Safepay in-place plan changes are not documented');
  }
  async getSubscription(id: string): Promise<BillingSubscription> {
    const response = await this.request<SafepaySubscriptionResponse>(
      `/client/subscriptions/v1/${encodeURIComponent(id)}`,
      { method: 'GET' },
      true,
    );
    const subscription = response.data?.subscription;
    if (!subscription?.token || !subscription.status)
      throw new BillingProviderError(
        'BILLING_PROVIDER_ERROR',
        'Safepay returned a malformed subscription',
      );
    const status = this.subscriptionStatus(subscription.status);
    const currentPeriodStart = this.isoDate(subscription.current_period_start_date);
    const currentPeriodEnd = this.isoDate(subscription.current_period_end_date);
    const providerUpdatedAt = this.isoDate(subscription.updated_at);
    return {
      providerSubscriptionId: subscription.token,
      status,
      providerPlanId: subscription.plan_id,
      providerCustomerId: subscription.user_id,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelledAt: subscription.canceled_at ? this.isoDate(subscription.canceled_at) : undefined,
      providerUpdatedAt,
    };
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
      'subscription.paused': 'SUBSCRIPTION_UPDATED',
      'subscription.resumed': 'SUBSCRIPTION_ACTIVATED',
      'subscription.payment.succeeded': 'SUBSCRIPTION_RENEWED',
      'subscription.payment.failed': 'PAYMENT_FAILED',
      'payment.succeeded': 'PAYMENT_SUCCEEDED',
      'payment.failed': 'PAYMENT_FAILED',
    };
    const eventStatus: Record<string, string> = {
      'subscription.canceled': 'CANCELED',
      'subscription.ended': 'ENDED',
      'subscription.paused': 'PAUSED',
      'subscription.resumed': 'ACTIVE',
    };
    return {
      id: event.token,
      type: types[event.type] ?? 'UNKNOWN',
      occurredAt: this.date(event.created_at),
      subscriptionId: d.id,
      checkoutSessionId: d.reference ?? d.tracker,
      priceId: d.plan_id,
      status: d.status ?? eventStatus[event.type],
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
  private isoDate(value: string | undefined) {
    const date = value ? new Date(value) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime()))
      throw new BillingProviderError(
        'BILLING_PROVIDER_ERROR',
        'Safepay returned malformed subscription dates',
      );
    return date;
  }
  private subscriptionStatus(value: string): NormalizedBillingSubscriptionStatus {
    const normalized = value.toUpperCase();
    const aliases: Record<string, NormalizedBillingSubscriptionStatus> = {
      TRAILING: 'TRIALING',
      TRIALING: 'TRIALING',
      ACTIVE: 'ACTIVE',
      PAST_DUE: 'PAST_DUE',
      UNPAID: 'UNPAID',
      CANCELED: 'CANCELED',
      CANCELLED: 'CANCELED',
      INCOMPLETE: 'INCOMPLETE',
      INCOMPLETE_EXPIRED: 'INCOMPLETE_EXPIRED',
      ENDED: 'ENDED',
      PAUSED: 'PAUSED',
    };
    const status = aliases[normalized];
    if (!status)
      throw new BillingProviderError(
        'BILLING_PROVIDER_ERROR',
        'Safepay returned an unsupported subscription status',
      );
    return status;
  }
  private unsupported<T>(message: string): Promise<T> {
    return Promise.reject(
      new BillingProviderError('BILLING_PROVIDER_OPERATION_UNSUPPORTED', message),
    );
  }
  private async getPassportToken() {
    const now = Date.now();
    if (this.passportToken && this.passportToken.expiresAt > now) return this.passportToken.value;
    if (this.passportRequest) return this.passportRequest;
    this.passportRequest = this.request<{ data: string }>('/client/passport/v1/token', {
      method: 'POST',
      body: '{}',
    }).then((auth) => {
      if (!auth.data)
        throw new BillingProviderError(
          'BILLING_PROVIDER_ERROR',
          'Safepay returned no authentication token',
        );
      this.passportToken = { value: auth.data, expiresAt: Date.now() + 110_000 };
      return auth.data;
    });
    try {
      return await this.passportRequest;
    } finally {
      this.passportRequest = null;
    }
  }
  private async request<T = unknown>(
    path: string,
    init: RequestInit,
    retrySafe = false,
  ): Promise<T> {
    if (!this.secret)
      throw new BillingProviderError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Safepay secret key is not configured',
      );
    const attempts = retrySafe ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
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
        if (response.status === 404)
          throw new BillingProviderError(
            'BILLING_SUBSCRIPTION_NOT_FOUND',
            'Safepay subscription was not found',
          );
        if (response.status === 429)
          throw new BillingProviderError(
            'BILLING_PROVIDER_RATE_LIMITED',
            'Safepay rate limit reached',
          );
        if (!response.ok) {
          if (retrySafe && response.status >= 500 && attempt + 1 < attempts) continue;
          throw new BillingProviderError(
            'BILLING_PROVIDER_ERROR',
            `Safepay request failed (${response.status})`,
          );
        }
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof BillingProviderError) throw error;
        if (attempt + 1 < attempts) continue;
        if (error instanceof Error && error.name === 'AbortError')
          throw new BillingProviderError('BILLING_PROVIDER_TIMEOUT', 'Safepay request timed out');
        throw new BillingProviderError('BILLING_PROVIDER_ERROR', 'Safepay request failed');
      } finally {
        clearTimeout(timer);
      }
    }
    throw new BillingProviderError('BILLING_PROVIDER_ERROR', 'Safepay request failed');
  }
}
