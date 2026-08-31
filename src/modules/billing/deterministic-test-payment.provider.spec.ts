import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { DeterministicTestPaymentProvider } from './deterministic-test-payment.provider';

describe('DeterministicTestPaymentProvider', () => {
  const secret = 'unit-test-webhook-secret';
  const config = {
    get: (key: string) =>
      key === 'app.env' ? 'test' : key === 'billing.webhookSecret' ? secret : undefined,
  } as ConfigService;
  const provider = new DeterministicTestPaymentProvider(config);
  it('creates deterministic checkout sessions', async () => {
    const input = {
      customerId: 'cus_1',
      priceId: 'price_1',
      successUrl: 'https://app/s',
      cancelUrl: 'https://app/c',
      idempotencyKey: 'same-key-123',
      metadata: {},
    };
    expect((await provider.createCheckoutSession(input)).id).toBe(
      (await provider.createCheckoutSession(input)).id,
    );
  });
  it('verifies exact raw bytes and normalizes dates', () => {
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt_1',
        type: 'SUBSCRIPTION_ACTIVATED',
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    expect(provider.verifyAndParseWebhook(raw, signature).occurredAt).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(() =>
      provider.verifyAndParseWebhook(Buffer.from(`${raw.toString()} `), signature),
    ).toThrow(ForbiddenException);
  });
  it('cannot start in production', () => {
    expect(
      () =>
        new DeterministicTestPaymentProvider({
          get: (key: string) => (key === 'app.env' ? 'production' : secret),
        } as ConfigService),
    ).toThrow('forbidden');
  });
});
