import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { BillingProviderError } from './billing-provider.error';
import {
  BillingSubscription,
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
    private audit: AuditService,
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
    if (!customer && this.provider.requiresCustomer) {
      const created = await this.provider.createCustomer({
        ownerType: dto.ownerType,
        ownerId,
        email: user.email,
      });
      if (!created)
        throw new ServiceUnavailableException('Payment provider customer creation failed');
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
      customerId: customer?.providerCustomerId ?? '',
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
    await this.audit.record({
      actorId: user.id,
      action: 'billing.checkout.create',
      entityType: 'billing_checkout',
      metadata: { provider, planId: plan.id, ownerType: dto.ownerType },
    });
    return {
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: session.expiresAt,
    };
  }
  async webhook(providerName: string, raw: Buffer, signature: string) {
    if (providerName !== this.provider.name)
      throw new NotFoundException('Unknown payment provider');
    let normalized: BillingWebhookEvent;
    try {
      normalized = this.provider.verifyAndParseWebhook(raw, signature);
    } catch (error) {
      await this.audit.record({
        action: 'billing.webhook.invalid_signature',
        entityType: 'billing_event',
        metadata: { provider: providerName },
        outcome: 'REJECTED',
      });
      if (
        error instanceof BillingProviderError &&
        error.code === 'BILLING_INVALID_WEBHOOK_SIGNATURE'
      )
        throw new UnauthorizedException('Invalid webhook signature');
      throw error;
    }
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
    await this.audit.record({
      action: 'billing.webhook.processed',
      entityType: 'billing_event',
      entityId: event.id,
      metadata: { provider: providerName, eventType: normalized.type },
    });
    return { accepted: true, duplicate: false };
  }
  async cancel(user: AuthenticatedUser) {
    this.activeProvider();
    const rows: Array<{ providerSubscriptionId: string }> = await this.data.query(
      `SELECT provider_subscription_id "providerSubscriptionId" FROM subscriptions WHERE provider=$1 AND provider_subscription_id IS NOT NULL AND (user_id=$2 OR school_id=$3) ORDER BY created_at DESC LIMIT 1`,
      [this.provider.name, user.id, user.role === UserRole.SCHOOL_ADMIN ? user.schoolId : null],
    );
    if (!rows[0]) throw new NotFoundException('Provider-managed subscription not found');
    await this.provider.cancelSubscription(rows[0].providerSubscriptionId);
    await this.audit.record({
      actorId: user.id,
      action: 'billing.subscription.cancel',
      entityType: 'subscription',
      metadata: { provider: this.provider.name },
    });
    return { accepted: true, activationRule: 'local state changes only after verified webhook' };
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
        if (e.status) target.status = this.localStatus(e.status);
        if (
          [
            'SUBSCRIPTION_ACTIVATED',
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
  async reconcile() {
    this.activeProvider();
    const subscriptions: Array<{
      id: string;
      providerSubscriptionId: string;
      providerStateUpdatedAt: Date | null;
    }> = await this.data.query(
      `SELECT id,provider_subscription_id "providerSubscriptionId",provider_state_updated_at "providerStateUpdatedAt"
       FROM subscriptions WHERE origin='PROVIDER' AND provider=$1 AND provider_subscription_id IS NOT NULL`,
      [this.provider.name],
    );
    const results: Array<{ subscriptionId: string; outcome: string; errorCode?: string }> = [];
    for (const local of subscriptions) {
      try {
        const remote = await this.provider.getSubscription(local.providerSubscriptionId);
        const outcome = await this.reconcileOne(local.id, remote);
        results.push({ subscriptionId: local.id, outcome });
      } catch (error) {
        results.push({
          subscriptionId: local.id,
          outcome: 'FAILED',
          errorCode: error instanceof BillingProviderError ? error.code : 'BILLING_PROVIDER_ERROR',
        });
      }
    }
    return {
      available: true,
      provider: this.provider.name,
      checked: subscriptions.length,
      updated: results.filter((item) => item.outcome === 'UPDATED').length,
      unchanged: results.filter((item) => item.outcome === 'UNCHANGED').length,
      stale: results.filter((item) => item.outcome === 'STALE_PROVIDER_STATE').length,
      failed: results.filter((item) => item.outcome === 'FAILED').length,
      results,
    };
  }

  private reconcileOne(localId: string, remote: BillingSubscription) {
    return this.data.transaction(async (manager) => {
      const rows: Array<{
        id: string;
        planId: string;
        status: SubscriptionStatus;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        cancelAtPeriodEnd: boolean;
        cancelledAt: Date | null;
        providerCustomerId: string | null;
        providerStateUpdatedAt: Date | null;
      }> = await manager.query(
        `SELECT id,plan_id "planId",status,current_period_start "currentPeriodStart",
         current_period_end "currentPeriodEnd",cancel_at_period_end "cancelAtPeriodEnd",
         cancelled_at "cancelledAt",provider_customer_id "providerCustomerId",
         provider_state_updated_at "providerStateUpdatedAt"
         FROM subscriptions WHERE id=$1 FOR UPDATE`,
        [localId],
      );
      const local = rows[0];
      if (!local) return 'UNCHANGED';
      if (
        local.providerStateUpdatedAt &&
        remote.providerUpdatedAt < new Date(local.providerStateUpdatedAt)
      )
        return 'STALE_PROVIDER_STATE';
      let planId = local.planId;
      if (remote.providerPlanId) {
        const mapping = await manager.getRepository(PlanProviderPrice).findOneBy({
          provider: this.provider.name,
          providerPriceId: remote.providerPlanId,
          active: true,
        });
        if (!mapping)
          throw new BillingProviderError(
            'BILLING_PROVIDER_ERROR',
            'Safepay subscription plan is not mapped locally',
          );
        planId = mapping.planId;
      }
      const status = this.localStatus(remote.status);
      const cancelAtPeriodEnd = remote.cancelAtPeriodEnd ?? local.cancelAtPeriodEnd;
      const cancelledAt = remote.cancelledAt ?? local.cancelledAt;
      const providerCustomerId = remote.providerCustomerId ?? local.providerCustomerId;
      const unchanged =
        planId === local.planId &&
        status === local.status &&
        remote.currentPeriodStart.getTime() === new Date(local.currentPeriodStart).getTime() &&
        remote.currentPeriodEnd.getTime() === new Date(local.currentPeriodEnd).getTime() &&
        cancelAtPeriodEnd === local.cancelAtPeriodEnd &&
        (cancelledAt?.getTime() ?? null) === (local.cancelledAt?.getTime() ?? null) &&
        providerCustomerId === local.providerCustomerId &&
        remote.providerUpdatedAt.getTime() ===
          (local.providerStateUpdatedAt?.getTime() ?? Number.NaN);
      if (unchanged) return 'UNCHANGED';
      await manager.query(
        `UPDATE subscriptions SET plan_id=$2,status=$3,current_period_start=$4,current_period_end=$5,
         cancel_at_period_end=$6,cancelled_at=$7,provider_customer_id=$8,provider_state_updated_at=$9,updated_at=now()
         WHERE id=$1`,
        [
          local.id,
          planId,
          status,
          remote.currentPeriodStart,
          remote.currentPeriodEnd,
          cancelAtPeriodEnd,
          cancelledAt,
          providerCustomerId,
          remote.providerUpdatedAt,
        ],
      );
      await this.audit.record(
        {
          action: 'billing.subscription.reconciled',
          entityType: 'subscription',
          entityId: local.id,
          metadata: {
            provider: this.provider.name,
            providerSubscriptionId: remote.providerSubscriptionId,
            status,
          },
        },
        manager,
      );
      return 'UPDATED';
    });
  }

  private localStatus(value: string) {
    const statuses: Record<string, SubscriptionStatus> = {
      TRAILING: SubscriptionStatus.TRIALING,
      TRIALING: SubscriptionStatus.TRIALING,
      ACTIVE: SubscriptionStatus.ACTIVE,
      PAST_DUE: SubscriptionStatus.PAST_DUE,
      UNPAID: SubscriptionStatus.PAST_DUE,
      INCOMPLETE: SubscriptionStatus.PAST_DUE,
      PAUSED: SubscriptionStatus.PAST_DUE,
      CANCELED: SubscriptionStatus.CANCELLED,
      CANCELLED: SubscriptionStatus.CANCELLED,
      INCOMPLETE_EXPIRED: SubscriptionStatus.EXPIRED,
      ENDED: SubscriptionStatus.EXPIRED,
      EXPIRED: SubscriptionStatus.EXPIRED,
    };
    const status = statuses[value.toUpperCase()];
    if (!status)
      throw new BillingProviderError(
        'BILLING_PROVIDER_ERROR',
        'Payment provider returned an unsupported subscription status',
      );
    return status;
  }
}
