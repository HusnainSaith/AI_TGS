import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Plan } from '../subscriptions/entities/plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';

@Entity('plan_provider_prices')
@Index(['provider', 'providerPriceId'], { unique: true })
export class PlanProviderPrice extends BaseEntity {
  @Column({ name: 'plan_id', type: 'uuid' }) planId!: string;
  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan!: Plan;
  @Column({ length: 40 }) provider!: string;
  @Column({ name: 'provider_product_id', type: 'varchar', length: 120, nullable: true })
  providerProductId!: string | null;
  @Column({ name: 'provider_price_id', length: 120 }) providerPriceId!: string;
  @Column({ length: 3 }) currency!: string;
  @Column({ name: 'billing_interval', length: 20 }) billingInterval!: string;
  @Column({ default: true }) active!: boolean;
}

@Entity('billing_customers')
@Index(['ownerType', 'ownerId', 'provider'], { unique: true })
@Index(['provider', 'providerCustomerId'], { unique: true })
export class BillingCustomer extends BaseEntity {
  @Column({ name: 'owner_type', length: 10 }) ownerType!: string;
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;
  @Column({ length: 40 }) provider!: string;
  @Column({ name: 'provider_customer_id', length: 120 }) providerCustomerId!: string;
}

@Entity('billing_checkout_sessions')
@Index(['userId', 'idempotencyKey'], { unique: true })
export class BillingCheckoutSession extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'owner_type', length: 10 }) ownerType!: string;
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId!: string;
  @Column({ length: 40 }) provider!: string;
  @Column({ name: 'provider_session_id', length: 120, unique: true }) providerSessionId!: string;
  @Column({ name: 'idempotency_key', length: 120 }) idempotencyKey!: string;
  @Column({ length: 20, default: 'OPEN' }) status!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
}

@Entity('billing_events')
@Index(['provider', 'providerEventId'], { unique: true })
export class BillingEvent extends BaseEntity {
  @Column({ length: 40 }) provider!: string;
  @Column({ name: 'provider_event_id', length: 120 }) providerEventId!: string;
  @Column({ name: 'event_type', length: 60 }) eventType!: string;
  @Column({ length: 20, default: 'RECEIVED' }) status!: string;
  @Column({ name: 'payload_hash', length: 64 }) payloadHash!: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' }) receivedAt!: Date;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt!: Date | null;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true })
  processingStartedAt!: Date | null;
  @Column({ name: 'retry_count', default: 0 }) retryCount!: number;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'related_subscription_id', type: 'uuid', nullable: true })
  relatedSubscriptionId!: string | null;
  @ManyToOne(() => Subscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'related_subscription_id' })
  subscription!: Subscription | null;
  @Column({ type: 'jsonb' }) normalized!: Record<string, unknown>;
}

@Entity('billing_transactions')
@Index(['provider', 'providerTransactionId'], { unique: true })
export class BillingTransaction extends BaseEntity {
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true }) subscriptionId!: string | null;
  @Column({ length: 40 }) provider!: string;
  @Column({ name: 'provider_transaction_id', length: 120 }) providerTransactionId!: string;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
  @Column({ length: 3 }) currency!: string;
  @Column({ length: 30 }) status!: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}
