import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/user.entity';
import { School } from '../../schools/school.entity';
import { Plan } from './plan.entity';
import { SubscriptionOrigin, SubscriptionStatus } from '../subscription.enums';
@Entity('subscriptions')
@Index(['userId'])
@Index(['schoolId'])
export class Subscription extends BaseEntity {
  @Column({
    type: 'enum',
    enum: SubscriptionOrigin,
    enumName: 'subscription_origin',
    default: SubscriptionOrigin.MANUAL,
  })
  origin!: SubscriptionOrigin;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
  @Column({ name: 'school_id', type: 'uuid', nullable: true }) schoolId!: string | null;
  @ManyToOne(() => School, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school!: School | null;
  @Column({ name: 'plan_id', type: 'uuid' }) planId!: string;
  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'plan_id' }) plan!: Plan;
  @Column({ type: 'enum', enum: SubscriptionStatus, enumName: 'subscription_status' })
  status!: SubscriptionStatus;
  @Column({ name: 'current_period_start', type: 'timestamptz' }) currentPeriodStart!: Date;
  @Column({ name: 'current_period_end', type: 'timestamptz' }) currentPeriodEnd!: Date;
  @Column({ name: 'cancel_at_period_end', default: false }) cancelAtPeriodEnd!: boolean;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt!: Date | null;
  @Column({ type: 'varchar', nullable: true, length: 40 }) provider!: string | null;
  @Column({ name: 'provider_customer_id', type: 'varchar', nullable: true, length: 120 })
  providerCustomerId!: string | null;
  @Column({ name: 'provider_subscription_id', type: 'varchar', nullable: true, length: 120 })
  providerSubscriptionId!: string | null;
  @Column({ name: 'provider_state_updated_at', type: 'timestamptz', nullable: true })
  providerStateUpdatedAt!: Date | null;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
}
