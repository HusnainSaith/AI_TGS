import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { configuration } from '../src/config/configuration';
import dataSourceOptions from '../src/database/data-source';
import { AuditModule } from '../src/modules/audit/audit.module';
import { Plan } from '../src/modules/subscriptions/entities/plan.entity';
import { Subscription } from '../src/modules/subscriptions/entities/subscription.entity';
import { EntitlementService } from '../src/modules/subscriptions/entitlement.service';
import { SubscriptionsModule } from '../src/modules/subscriptions/subscriptions.module';
import {
  BillingInterval,
  SubscriptionStatus,
} from '../src/modules/subscriptions/subscription.enums';
import { UsageService } from '../src/modules/subscriptions/usage.service';
import { User } from '../src/modules/users/user.entity';

const run = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;
run('Transactional subscription usage with PostgreSQL (e2e)', () => {
  let app: INestApplication, db: DataSource, entitlement: EntitlementService, usage: UsageService;
  const ids = { user: randomUUID(), plan: randomUUID(), subscription: randomUUID() };
  const user: AuthenticatedUser = {
    id: ids.user,
    email: `${ids.user}@test.invalid`,
    role: UserRole.TEACHER,
    schoolId: null,
    emailVerified: true,
  };
  beforeAll(async () => {
    const ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRoot({ ...dataSourceOptions.options, migrations: [] }),
        AuditModule,
        SubscriptionsModule,
      ],
    }).compile();
    app = ref.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    entitlement = app.get(EntitlementService);
    usage = app.get(UsageService);
    await db.getRepository(User).insert({
      id: ids.user,
      name: 'quota teacher',
      email: user.email,
      passwordHash: await hash(randomUUID()),
      role: UserRole.TEACHER,
      emailVerified: true,
      schoolId: null,
    });
    await db.getRepository(Plan).insert({
      id: ids.plan,
      name: 'Quota E2E',
      code: `QUOTA_${ids.plan.replaceAll('-', '')}`,
      price: '0.00',
      currency: 'USD',
      billingInterval: BillingInterval.MONTHLY,
      isActive: true,
      isDefault: false,
      limits: { aiQuestionsPerPeriod: 10 },
      features: {},
    });
    await db.getRepository(Subscription).insert({
      id: ids.subscription,
      userId: ids.user,
      schoolId: null,
      planId: ids.plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(Date.now() - 60000),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      metadata: null,
    });
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DELETE FROM audit_logs WHERE actor_id=$1`, [ids.user]);
      await db.query(`DELETE FROM usage_ledger WHERE subscription_id=$1`, [ids.subscription]);
      await db.query(`DELETE FROM usage_reservations WHERE subscription_id=$1`, [ids.subscription]);
      await db.query(`DELETE FROM usage_counters WHERE subscription_id=$1`, [ids.subscription]);
      await db.getRepository(Subscription).delete(ids.subscription);
      await db.getRepository(Plan).delete(ids.plan);
      await db.getRepository(User).delete(ids.user);
    }
    await app?.close();
  });
  it('prevents true concurrent oversubscription and keeps reservation idempotent', async () => {
    const ent = await entitlement.resolve(user);
    const refA = randomUUID(),
      refB = randomUUID();
    const outcomes = await Promise.allSettled([
      usage.reserve(ent, 7, 'GENERATION_JOB', refA, user.id),
      usage.reserve(ent, 7, 'GENERATION_JOB', refB, user.id),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const [counter] = await db.query(
      `SELECT used::int,reserved::int FROM usage_counters WHERE subscription_id=$1`,
      [ids.subscription],
    );
    expect(counter).toEqual({ used: 0, reserved: 7 });
    const winner = outcomes[0].status === 'fulfilled' ? refA : refB;
    await usage.reserve(ent, 7, 'GENERATION_JOB', winner, user.id);
    const [same] = await db.query(
      `SELECT reserved::int FROM usage_counters WHERE subscription_id=$1`,
      [ids.subscription],
    );
    expect(same.reserved).toBe(7);
  });
});
