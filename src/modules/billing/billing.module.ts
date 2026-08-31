import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PAYMENT_PROVIDER } from '../../infrastructure/providers/provider.contracts';
import { Plan } from '../subscriptions/entities/plan.entity';
import { BillingController, AdminBillingController } from './billing.controller';
import {
  BillingCheckoutSession,
  BillingCustomer,
  BillingEvent,
  BillingTransaction,
  PlanProviderPrice,
} from './billing.entities';
import { BillingService } from './billing.service';
import { DeterministicTestPaymentProvider } from './deterministic-test-payment.provider';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plan,
      PlanProviderPrice,
      BillingCustomer,
      BillingCheckoutSession,
      BillingEvent,
      BillingTransaction,
    ]),
  ],
  controllers: [BillingController, AdminBillingController],
  providers: [
    DeterministicTestPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: DeterministicTestPaymentProvider },
    BillingService,
  ],
})
export class BillingModule {}
