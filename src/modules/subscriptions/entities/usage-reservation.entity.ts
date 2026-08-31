import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { ReservationStatus, UsageMetric } from '../subscription.enums';
@Entity('usage_reservations')
@Index(['referenceType', 'referenceId', 'metric'], { unique: true })
export class UsageReservation extends BaseEntity {
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId!: string;
  @Column({ name: 'usage_counter_id', type: 'uuid' }) usageCounterId!: string;
  @Column({ type: 'enum', enum: UsageMetric, enumName: 'usage_metric' }) metric!: UsageMetric;
  @Column({ type: 'bigint' }) amount!: number;
  @Column({ name: 'settled_amount', type: 'bigint', default: 0 }) settledAmount!: number;
  @Column({ name: 'released_amount', type: 'bigint', default: 0 }) releasedAmount!: number;
  @Column({ type: 'enum', enum: ReservationStatus, enumName: 'usage_reservation_status' })
  status!: ReservationStatus;
  @Column({ name: 'reference_type', length: 40 }) referenceType!: string;
  @Column({ name: 'reference_id', type: 'uuid' }) referenceId!: string;
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', length: 160 })
  idempotencyKey!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true }) settledAt!: Date | null;
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt!: Date | null;
}
