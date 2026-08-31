import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { BillingInterval } from '../subscription.enums';
export interface PlanLimits {
  aiQuestionsPerPeriod: number | null;
  testsPerPeriod?: number | null;
  pdfExportsPerPeriod?: number | null;
  storageBytes?: number | null;
}
@Entity('plans')
export class Plan extends BaseEntity {
  @Column({ length: 60 }) name!: string;
  @Index({ unique: true }) @Column({ length: 60 }) code!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'numeric', precision: 10, scale: 2 }) price!: string;
  @Column({ length: 3, default: 'USD' }) currency!: string;
  @Column({
    name: 'billing_interval',
    type: 'enum',
    enum: BillingInterval,
    enumName: 'billing_interval',
  })
  billingInterval!: BillingInterval;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
  @Column({ type: 'jsonb' }) limits!: PlanLimits;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) features!: Record<string, unknown>;
}
