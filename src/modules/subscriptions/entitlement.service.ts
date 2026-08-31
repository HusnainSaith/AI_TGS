/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EntitlementErrorCode, SubscriptionStatus, UsageMetric } from './subscription.enums';
export class EntitlementException extends ConflictException {
  constructor(public readonly code: EntitlementErrorCode) {
    super({ statusCode: 409, error: 'Entitlement denied', code });
  }
}
export interface ResolvedEntitlement {
  subscriptionId: string;
  planId: string;
  metric: UsageMetric;
  limit: number | null;
  periodStart: Date;
  periodEnd: Date;
}
@Injectable()
export class EntitlementService {
  constructor(private readonly data: DataSource) {}
  async resolve(
    user: AuthenticatedUser,
    metric = UsageMetric.AI_QUESTIONS,
    manager?: EntityManager,
  ): Promise<ResolvedEntitlement> {
    const db = manager ?? this.data.manager;
    const rows = await db.query(
      `SELECT s.id subscription_id,s.plan_id,s.status,s.current_period_start,s.current_period_end,p.is_active,p.limits FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE ((s.user_id=$1) OR ($2::uuid IS NOT NULL AND s.school_id=$2)) ORDER BY CASE WHEN s.school_id IS NOT NULL THEN 0 ELSE 1 END,s.created_at DESC`,
      [user.id, user.schoolId ?? null],
    );
    if (!rows.length) throw new EntitlementException(EntitlementErrorCode.NO_ACTIVE_SUBSCRIPTION);
    const now = Date.now();
    const row =
      rows.find(
        (r: any) =>
          [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(r.status) &&
          new Date(r.current_period_start).getTime() <= now &&
          now < new Date(r.current_period_end).getTime(),
      ) ?? rows[0];
    if (!row.is_active) throw new EntitlementException(EntitlementErrorCode.PLAN_INACTIVE);
    if (![SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(row.status))
      throw new EntitlementException(EntitlementErrorCode.SUBSCRIPTION_INACTIVE);
    if (!(
      new Date(row.current_period_start).getTime() <= now &&
      now < new Date(row.current_period_end).getTime()
    ))
      throw new EntitlementException(EntitlementErrorCode.SUBSCRIPTION_EXPIRED);
    const key: Record<UsageMetric, string> = {
      [UsageMetric.AI_QUESTIONS]: 'aiQuestionsPerPeriod',
      [UsageMetric.TESTS]: 'testsPerPeriod',
      [UsageMetric.PDF_EXPORTS]: 'pdfExportsPerPeriod',
      [UsageMetric.STORAGE_BYTES]: 'storageBytes',
    };
    const value = row.limits?.[key[metric]];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new EntitlementException(EntitlementErrorCode.ENTITLEMENT_CONFIGURATION_ERROR);
    return {
      subscriptionId: row.subscription_id,
      planId: row.plan_id,
      metric,
      limit: value ?? null,
      periodStart: new Date(row.current_period_start),
      periodEnd: new Date(row.current_period_end),
    };
  }
}
