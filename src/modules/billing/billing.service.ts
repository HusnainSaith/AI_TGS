import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  BillingWebhookEvent,
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../../infrastructure/providers/provider.contracts';
import { Plan } from '../subscriptions/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { SubscriptionOrigin, SubscriptionStatus } from '../subscriptions/subscription.enums';
import {
  BillingCheckoutSession,
  BillingCustomer,
  BillingEvent,
  BillingTransaction,
  PlanProviderPrice,
} from './billing.entities';
import { CheckoutDto, PlanProviderPriceDto } from './billing.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Plan) private plans: Repository<Plan>,
    @InjectRepository(PlanProviderPrice) private prices: Repository<PlanProviderPrice>,
    @InjectRepository(BillingCustomer) private customers: Repository<BillingCustomer>,
    @InjectRepository(BillingCheckoutSession) private checkouts: Repository<BillingCheckoutSession>,
    @InjectRepository(BillingEvent) private events: Repository<BillingEvent>,
    private data: DataSource,
    private config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}
  private activeProvider() {
    const configured = this.config.get<string>('billing.provider');
    if (configured !== this.provider.name)
      throw new ServiceUnavailableException('Payment provider is not configured');
    return configured;
  }
  async checkout(dto: CheckoutDto, user: AuthenticatedUser) {
    const provider = this.activeProvider();
    const ownerId = dto.ownerType === 'SCHOOL' ? user.schoolId : user.id;
    if (!ownerId || (dto.ownerType === 'SCHOOL' && user.role !== UserRole.SCHOOL_ADMIN))
      throw new BadRequestException('Billing owner is not authorized');
    const existing = await this.checkouts.findOneBy({
      userId: user.id,
      idempotencyKey: dto.idempotencyKey,
    });
    if (existing)
      return {
        checkoutSessionId: existing.providerSessionId,
        checkoutUrl: `https://test.invalid/checkout/${existing.providerSessionId}`,
        expiresAt: existing.expiresAt,
      };
    const plan = await this.plans.findOneBy({ id: dto.planId, isActive: true });
    if (!plan) throw new NotFoundException('Active plan not found');
    const mapping = await this.prices.findOneBy({ planId: plan.id, provider, active: true });
    if (!mapping) throw new BadRequestException('Plan is not commercially configured');
    let customer = await this.customers.findOneBy({ ownerType: dto.ownerType, ownerId, provider });
    if (!customer) {
      const created = await this.provider.createCustomer({
        ownerType: dto.ownerType,
        ownerId,
        email: user.email,
      });
      customer = await this.customers.save(
        this.customers.create({
          ownerType: dto.ownerType,
          ownerId,
          provider,
          providerCustomerId: created.id,
        }),
      );
    }
    const session = await this.provider.createCheckoutSession({
      customerId: customer.providerCustomerId,
      priceId: mapping.providerPriceId,
      successUrl: this.config.getOrThrow('billing.successUrl'),
      cancelUrl: this.config.getOrThrow('billing.cancelUrl'),
      idempotencyKey: dto.idempotencyKey,
      metadata: { planId: plan.id, ownerType: dto.ownerType, ownerId },
    });
    try {
      await this.checkouts.save(
        this.checkouts.create({
          userId: user.id,
          ownerType: dto.ownerType,
          ownerId,
          planId: plan.id,
          provider,
          providerSessionId: session.id,
          idempotencyKey: dto.idempotencyKey,
          expiresAt: session.expiresAt,
          status: 'OPEN',
        }),
      );
    } catch {
      throw new ConflictException('Checkout idempotency conflict');
    }
    return {
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: session.expiresAt,
    };
  }
  async webhook(providerName: string, raw: Buffer, signature: string) {
    if (providerName !== this.provider.name)
      throw new NotFoundException('Unknown payment provider');
    const normalized = this.provider.verifyAndParseWebhook(raw, signature);
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    let event = await this.events.findOneBy({
      provider: providerName,
      providerEventId: normalized.id,
    });
    if (event) return { accepted: true, duplicate: true };
    try {
      event = await this.events.save(
        this.events.create({
          provider: providerName,
          providerEventId: normalized.id,
          eventType: normalized.type,
          occurredAt: normalized.occurredAt,
          payloadHash,
          normalized: normalized as unknown as Record<string, unknown>,
          status: 'RECEIVED',
          retryCount: 0,
        }),
      );
    } catch {
      return { accepted: true, duplicate: true };
    }
    await this.process(event.id, normalized);
    return { accepted: true, duplicate: false };
  }
  private async process(eventId: string, e: BillingWebhookEvent) {
    await this.data.transaction(async (manager) => {
      const repo = manager.getRepository(BillingEvent);
      const row = await repo.findOne({
        where: { id: eventId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.status === 'PROCESSED' || row.status === 'IGNORED') return;
      row.status = 'PROCESSING';
      row.processingToken = randomUUID();
      row.processingStartedAt = new Date();
      row.retryCount += 1;
      await repo.save(row);
      if (e.type === 'UNKNOWN') {
        row.status = 'IGNORED';
        row.processedAt = new Date();
        await repo.save(row);
        return;
      }
      const checkout = e.checkoutSessionId
        ? await manager
            .getRepository(BillingCheckoutSession)
            .findOneBy({ providerSessionId: e.checkoutSessionId })
        : null;
      if (checkout && e.type === 'CHECKOUT_COMPLETED') {
        checkout.status = 'COMPLETED';
        await manager.save(BillingCheckoutSession, checkout);
      }
      const subscription = e.subscriptionId
        ? await manager
            .getRepository(Subscription)
            .createQueryBuilder('s')
            .setLock('pessimistic_write')
            .where('s.provider = :p AND s.provider_subscription_id = :id', {
              p: row.provider,
              id: e.subscriptionId,
            })
            .getOne()
        : null;
      let target = subscription;
      if (!target && checkout && e.subscriptionId && e.periodStart && e.periodEnd) {
        target = manager.create(Subscription, {
          userId: checkout.ownerType === 'USER' ? checkout.ownerId : null,
          schoolId: checkout.ownerType === 'SCHOOL' ? checkout.ownerId : null,
          planId: checkout.planId,
          origin: SubscriptionOrigin.PROVIDER,
          status: SubscriptionStatus.TRIALING,
          currentPeriodStart: e.periodStart ?? e.occurredAt,
          currentPeriodEnd: e.periodEnd ?? e.occurredAt,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          provider: row.provider,
          providerSubscriptionId: e.subscriptionId,
          providerCustomerId: e.customerId ?? null,
          providerStateUpdatedAt: e.occurredAt,
          metadata: null,
        });
      }
      if (
        target &&
        (!target.providerStateUpdatedAt || e.occurredAt >= target.providerStateUpdatedAt)
      ) {
        if (e.type === 'PLAN_CHANGED' && e.priceId) {
          const mapped = await manager
            .getRepository(PlanProviderPrice)
            .findOneBy({ provider: row.provider, providerPriceId: e.priceId, active: true });
          if (mapped) target.planId = mapped.planId;
        }
        if (e.periodStart) target.currentPeriodStart = e.periodStart;
        if (e.periodEnd) target.currentPeriodEnd = e.periodEnd;
        if (e.cancelAtPeriodEnd !== undefined) target.cancelAtPeriodEnd = e.cancelAtPeriodEnd;
        if (
          [
            'SUBSCRIPTION_ACTIVATED',
            'SUBSCRIPTION_CREATED',
            'SUBSCRIPTION_RENEWED',
            'PAYMENT_SUCCEEDED',
            'INVOICE_PAID',
          ].includes(e.type)
        )
          target.status = SubscriptionStatus.ACTIVE;
        if (['PAYMENT_FAILED', 'INVOICE_PAYMENT_FAILED'].includes(e.type))
          target.status = SubscriptionStatus.PAST_DUE;
        if (e.type === 'SUBSCRIPTION_CANCELED') target.status = SubscriptionStatus.CANCELLED;
        if (e.type === 'SUBSCRIPTION_EXPIRED') target.status = SubscriptionStatus.EXPIRED;
        target.providerStateUpdatedAt = e.occurredAt;
        target = await manager.save(Subscription, target);
        row.relatedSubscriptionId = target.id;
      }
      if (e.transaction)
        await manager.getRepository(BillingTransaction).upsert(
          {
            subscriptionId: target?.id ?? null,
            provider: row.provider,
            providerTransactionId: e.transaction.id,
            amountMinor: String(e.transaction.amountMinor),
            currency: e.transaction.currency.toUpperCase(),
            status: e.transaction.status,
            occurredAt: e.occurredAt,
          },
          ['provider', 'providerTransactionId'],
        );
      row.status = 'PROCESSED';
      row.processedAt = new Date();
      row.processingToken = null;
      await repo.save(row);
    });
  }
  listEvents() {
    return this.events.find({ order: { receivedAt: 'DESC' }, take: 100 });
  }
  listTransactions(user: AuthenticatedUser) {
    return this.data.query(
      `SELECT t.* FROM billing_transactions t JOIN subscriptions s ON s.id=t.subscription_id WHERE s.user_id=$1 OR s.school_id=$2 ORDER BY t.occurred_at DESC`,
      [user.id, user.schoolId],
    );
  }
  listMappings() {
    return this.prices.find({ relations: { plan: true }, order: { createdAt: 'DESC' } });
  }
  createMapping(dto: PlanProviderPriceDto) {
    return this.prices.save(
      this.prices.create({
        ...dto,
        currency: dto.currency.toUpperCase(),
        active: dto.active ?? true,
      }),
    );
  }
  async retry(id: string) {
    const row = await this.events.findOneBy({ id });
    if (!row) throw new NotFoundException();
    const raw = row.normalized as unknown as BillingWebhookEvent;
    await this.process(id, {
      ...raw,
      occurredAt: new Date(raw.occurredAt),
      periodStart: raw.periodStart ? new Date(raw.periodStart) : undefined,
      periodEnd: raw.periodEnd ? new Date(raw.periodEnd) : undefined,
    });
    return this.events.findOneByOrFail({ id });
  }
  reconcile() {
    return { available: false, reason: 'No production payment provider selected' };
  }
}
