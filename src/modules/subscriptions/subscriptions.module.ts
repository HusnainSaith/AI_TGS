import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { EntitlementService } from './entitlement.service';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { UsageCounter } from './entities/usage-counter.entity';
import { UsageLedger } from './entities/usage-ledger.entity';
import { UsageReservation } from './entities/usage-reservation.entity';
import { GenerationEntitlementService } from './generation-entitlement.service';
import { AdminSubscriptionsController, SubscriptionController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, Subscription, UsageCounter, UsageReservation, UsageLedger]),
    AuditModule,
  ],
  controllers: [AdminSubscriptionsController, SubscriptionController],
  providers: [EntitlementService, UsageService, GenerationEntitlementService, SubscriptionsService],
  exports: [EntitlementService, UsageService, GenerationEntitlementService],
})
export class SubscriptionsModule {}
