import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { Subscription } from './subscription.entity';
import { UsageMetric } from '../subscription.enums';
@Entity('usage_counters')
@Index(['subscriptionId', 'metric', 'periodStart', 'periodEnd'], { unique: true })
export class UsageCounter extends BaseEntity {
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId!: string;
  @ManyToOne(() => Subscription, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: Subscription;
  @Column({ type: 'enum', enum: UsageMetric, enumName: 'usage_metric' }) metric!: UsageMetric;
  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  used!: number;
  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  reserved!: number;
  @Column({ name: 'period_start', type: 'timestamptz' }) periodStart!: Date;
  @Column({ name: 'period_end', type: 'timestamptz' }) periodEnd!: Date;
}
