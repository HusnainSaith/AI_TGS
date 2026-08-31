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
import { SafepayPaymentProvider } from './safepay-payment.provider';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
@Module({
  imports: [
    AuditModule,
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
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('billing.provider') === 'safepay'
          ? new SafepayPaymentProvider(config)
          : new DeterministicTestPaymentProvider(config),
    },
    BillingService,
  ],
})
export class BillingModule {}
