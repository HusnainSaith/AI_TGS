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
  const provider = new SafepayPaymentProvider({
    get: (key: string) => values[key],
  } as ConfigService);
  afterEach(() => jest.restoreAllMocks());

  it('creates a sandbox subscription checkout with trusted plan and redirect values', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: 'fake-auth-token' }), { status: 200 }),
      );
    const result = await provider.createCheckoutSession({
      customerId: '',
      priceId: 'plan_fake',
      successUrl: 'https://app.test/success',
      cancelUrl: 'https://app.test/cancel',
      idempotencyKey: 'checkout-reference',
      metadata: {},
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox.api.getsafepay.com/client/passport/v1/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-sfpy-merchant-secret': 'fake-secret' }),
      }),
    );
    const url = new URL(result.url);
    expect(url.origin).toBe('https://sandbox.api.getsafepay.com');
    expect(url.searchParams.get('plan_id')).toBe('plan_fake');
    expect(url.searchParams.get('reference')).toBe('checkout-reference');
    expect(result.url).not.toContain('fake-secret');
  });

  it('verifies exact raw bytes with HMAC-SHA512 and normalizes a renewal', () => {
    const raw = Buffer.from(
      JSON.stringify({
        token: 'evt_fake',
        version: '2.0.0',
        type: 'subscription.payment.succeeded',
        created_at: { seconds: 1710825617 },
        data: {
          id: 'sub_fake',
          plan_id: 'plan_fake',
          status: 'ACTIVE',
          amount: 405100,
          currency: 'PKR',
          current_period_start_date: { seconds: 1710824626 },
          current_period_end_date: { seconds: 1713503026 },
          transaction_id: 'txn_fake',
          transaction_status: 'COMPLETE',
        },
      }),
    );
    const signature = createHmac('sha512', 'fake-webhook-secret').update(raw).digest('hex');
    const event = provider.verifyAndParseWebhook(raw, signature);
    expect(event.type).toBe('SUBSCRIPTION_RENEWED');
    expect(event.transaction).toEqual(
      expect.objectContaining({ amountMinor: 405100, currency: 'PKR' }),
    );
    expect(() =>
      provider.verifyAndParseWebhook(Buffer.concat([raw, Buffer.from(' ')]), signature),
    ).toThrow(BillingProviderError);
  });

  it('normalizes unknown events without trusting them', () => {
    const raw = Buffer.from(
      JSON.stringify({
        token: 'evt_unknown',
        version: '2.0.0',
        type: 'future.event',
        created_at: { seconds: 1710825617 },
        data: {},
      }),
    );
    const signature = createHmac('sha512', 'fake-webhook-secret').update(raw).digest('hex');
    expect(provider.verifyAndParseWebhook(raw, signature).type).toBe('UNKNOWN');
  });

  it('reports undocumented operations as unsupported', async () => {
    await expect(provider.changeSubscriptionPlan('sub_fake', 'plan_new')).rejects.toMatchObject({
      code: 'BILLING_PROVIDER_OPERATION_UNSUPPORTED',
    });
    await expect(provider.getSubscription('sub_fake')).rejects.toMatchObject({
      code: 'BILLING_PROVIDER_OPERATION_UNSUPPORTED',
    });
  });
});
