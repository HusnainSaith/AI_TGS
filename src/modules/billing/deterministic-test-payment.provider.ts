import { createHmac, timingSafeEqual } from 'crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingWebhookEvent,
  PaymentProvider,
} from '../../infrastructure/providers/provider.contracts';

@Injectable()
export class DeterministicTestPaymentProvider implements PaymentProvider {
  readonly name = 'test';
  private readonly secret: string;
  constructor(config: ConfigService) {
    if (config.get('app.env') === 'production')
      throw new Error('Test payment provider is forbidden in production');
    this.secret = config.get<string>('billing.webhookSecret') || 'billing-test-secret';
  }
  createCustomer(input: { ownerType: 'USER' | 'SCHOOL'; ownerId: string }) {
    return Promise.resolve({ id: `cus_test_${input.ownerType.toLowerCase()}_${input.ownerId}` });
  }
  createCheckoutSession(input: { idempotencyKey: string }) {
    const id = `cs_test_${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 48)}`;
    return Promise.resolve({
      id,
      url: `https://test.invalid/checkout/${id}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
  }
  createBillingPortalSession(input: { customerId: string }) {
    return Promise.resolve({ url: `https://test.invalid/portal/${input.customerId}` });
  }
  cancelSubscription() {
    return Promise.resolve();
  }
  changeSubscriptionPlan() {
    return Promise.resolve();
  }
  getSubscription() {
    return Promise.reject(
      new Error('Deterministic provider state must be supplied by a signed event'),
    );
  }
  verifyAndParseWebhook(payload: Buffer, signature: string): BillingWebhookEvent {
    const expected = createHmac('sha256', this.secret).update(payload).digest('hex');
    const actual = Buffer.from(signature || '', 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted))
      throw new ForbiddenException('Invalid webhook signature');
    const value = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
    if (!value.id || !value.type || !value.occurredAt)
      throw new ForbiddenException('Invalid webhook payload');
    if (typeof value.occurredAt !== 'string')
      throw new ForbiddenException('Invalid webhook payload');
    if (value.periodStart !== undefined && typeof value.periodStart !== 'string')
      throw new ForbiddenException('Invalid webhook payload');
    if (value.periodEnd !== undefined && typeof value.periodEnd !== 'string')
      throw new ForbiddenException('Invalid webhook payload');
    return {
      ...value,
      occurredAt: new Date(value.occurredAt),
      periodStart: value.periodStart ? new Date(value.periodStart) : undefined,
      periodEnd: value.periodEnd ? new Date(value.periodEnd) : undefined,
    } as BillingWebhookEvent;
  }
}
