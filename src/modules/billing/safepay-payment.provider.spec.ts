import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BillingProviderError } from './billing-provider.error';
import { SafepayPaymentProvider } from './safepay-payment.provider';

describe('SafepayPaymentProvider', () => {
  const values: Record<string, unknown> = {
    'billing.safepay.environment': 'sandbox',
    'billing.safepay.secretKey': 'fake-secret',
    'billing.safepay.webhookSecret': 'fake-webhook-secret',
    'billing.safepay.timeoutMs': 1000,
  };
  let provider: SafepayPaymentProvider;

  beforeEach(() => {
    provider = new SafepayPaymentProvider({
      get: (key: string) => values[key],
    } as ConfigService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates checkouts with one cached short-lived passport token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: 'fake-auth-token' }), { status: 200 }),
      );
    const input = {
      customerId: '',
      priceId: 'plan_fake',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
      idempotencyKey: 'checkout-reference',
      metadata: {},
    };
    const first = await provider.createCheckoutSession(input);
    await provider.createCheckoutSession({ ...input, idempotencyKey: 'second-reference' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.api.getsafepay.com/client/passport/v1/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-sfpy-merchant-secret': 'fake-secret' }),
      }),
    );
    const url = new URL(first.url);
    expect(url.searchParams.get('plan_id')).toBe('plan_fake');
    expect(url.searchParams.get('reference')).toBe('checkout-reference');
    expect(first.url).not.toContain('fake-secret');
  });

  it('uses the documented cancellation route without retrying', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await provider.cancelSubscription('sub/a');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.api.getsafepay.com/client/subscriptions/v1/sub%2Fa/cancel',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it.each([
    ['TRAILING', 'TRIALING'],
    ['TRIALING', 'TRIALING'],
    ['ACTIVE', 'ACTIVE'],
    ['PAST_DUE', 'PAST_DUE'],
    ['UNPAID', 'UNPAID'],
    ['CANCELED', 'CANCELED'],
    ['CANCELLED', 'CANCELED'],
    ['INCOMPLETE', 'INCOMPLETE'],
    ['INCOMPLETE_EXPIRED', 'INCOMPLETE_EXPIRED'],
    ['ENDED', 'ENDED'],
    ['PAUSED', 'PAUSED'],
  ])('retrieves and normalizes Safepay status %s', async (remoteStatus, expectedStatus) => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            subscription: {
              token: 'sub_fake',
              plan_id: 'plan_fake',
              user_id: 'user_fake',
              status: remoteStatus,
              current_period_start_date: '2026-08-01T00:00:00.000Z',
              current_period_end_date: '2026-09-01T00:00:00.000Z',
              cancel_at_period_end: true,
              updated_at: '2026-08-15T00:00:00.000Z',
            },
          },
        }),
        { status: 200 },
      ),
    );
    const result = await provider.getSubscription('sub/a');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.api.getsafepay.com/client/subscriptions/v1/sub%2Fa',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        providerSubscriptionId: 'sub_fake',
        providerPlanId: 'plan_fake',
        providerCustomerId: 'user_fake',
        status: expectedStatus,
        cancelAtPeriodEnd: true,
        providerUpdatedAt: new Date('2026-08-15T00:00:00.000Z'),
      }),
    );
  });

  it.each([
    [401, 'BILLING_PROVIDER_AUTH_FAILED'],
    [404, 'BILLING_SUBSCRIPTION_NOT_FOUND'],
    [429, 'BILLING_PROVIDER_RATE_LIMITED'],
  ])('maps HTTP %i to %s', async (status, code) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status }));
    await expect(provider.getSubscription('sub_fake')).rejects.toMatchObject({ code });
  });

  it('rejects malformed subscription responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: { subscription: { token: 'sub_fake', status: 'ACTIVE' } } }),
          { status: 200 },
        ),
      );
    await expect(provider.getSubscription('sub_fake')).rejects.toMatchObject({
      code: 'BILLING_PROVIDER_ERROR',
    });
  });

  it('retries one safe retrieval after a server error', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(provider.getSubscription('sub_fake')).rejects.toMatchObject({
      code: 'BILLING_SUBSCRIPTION_NOT_FOUND',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes a repeated retrieval abort as a timeout', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);
    await expect(provider.getSubscription('sub_fake')).rejects.toMatchObject({
      code: 'BILLING_PROVIDER_TIMEOUT',
    });
  });

  it('verifies raw HMAC-SHA512 bytes and normalizes every documented event', () => {
    for (const [type, expected, status] of [
      ['subscription.created', 'SUBSCRIPTION_CREATED', undefined],
      ['subscription.canceled', 'SUBSCRIPTION_CANCELED', 'CANCELED'],
      ['subscription.ended', 'SUBSCRIPTION_EXPIRED', 'ENDED'],
      ['subscription.paused', 'SUBSCRIPTION_UPDATED', 'PAUSED'],
      ['subscription.resumed', 'SUBSCRIPTION_ACTIVATED', 'ACTIVE'],
      ['subscription.payment.succeeded', 'SUBSCRIPTION_RENEWED', undefined],
      ['subscription.payment.failed', 'PAYMENT_FAILED', undefined],
      ['payment.succeeded', 'PAYMENT_SUCCEEDED', undefined],
      ['payment.failed', 'PAYMENT_FAILED', undefined],
    ]) {
      const raw = Buffer.from(
        JSON.stringify({
          token: `evt_${type}`,
          version: '2.0.0',
          type,
          created_at: { seconds: 1710825617 },
          data: {},
        }),
      );
      const signature = createHmac('sha512', 'fake-webhook-secret').update(raw).digest('hex');
      expect(provider.verifyAndParseWebhook(raw, signature)).toEqual(
        expect.objectContaining({ type: expected, ...(status ? { status } : {}) }),
      );
      expect(() =>
        provider.verifyAndParseWebhook(Buffer.concat([raw, Buffer.from(' ')]), signature),
      ).toThrow(BillingProviderError);
    }
  });

  it('keeps undocumented plan changes unsupported without making a request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(provider.changeSubscriptionPlan('sub_fake', 'plan_new')).rejects.toMatchObject({
      code: 'BILLING_PROVIDER_OPERATION_UNSUPPORTED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
