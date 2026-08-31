import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UsageEventType, UsageMetric } from '../subscription.enums';
@Entity('usage_ledger')
export class UsageLedger {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId!: string;
  @Column({ type: 'enum', enum: UsageMetric, enumName: 'usage_metric' }) metric!: UsageMetric;
  @Column({ type: 'enum', enum: UsageEventType, enumName: 'usage_event_type' })
  eventType!: UsageEventType;
  @Column({ type: 'bigint' }) amount!: number;
  @Column({ name: 'reservation_id', type: 'uuid', nullable: true }) reservationId!: string | null;
  @Column({ name: 'reference_type', length: 40 }) referenceType!: string;
  @Column({ name: 'reference_id', type: 'uuid' }) referenceId!: string;
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', length: 180 })
  idempotencyKey!: string;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
