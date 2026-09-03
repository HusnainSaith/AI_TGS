import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class ReportingService {
  constructor(private data: DataSource) {}
  async currentCycle(user: AuthenticatedUser) {
    const [subscription] = await this.data.query(
      `SELECT s.id,s.school_id "schoolId",s.user_id "userId",s.current_period_start "periodStart",s.current_period_end "periodEnd",p.name "planName",p.limits FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.status IN ('ACTIVE','TRIALING') AND s.current_period_start<=now() AND s.current_period_end>now() AND (($1::uuid IS NOT NULL AND s.school_id=$1) OR ($1::uuid IS NULL AND s.user_id=$2)) ORDER BY s.created_at DESC LIMIT 1`,
      [user.schoolId, user.id],
    );
    if (!subscription) throw new NotFoundException('Active subscription not found');
    const counters: Array<{ metric: string; used: string; reserved: string }> =
      await this.data.query(
        `SELECT metric,used::text,reserved::text FROM usage_counters WHERE subscription_id=$1 AND period_start=$2 AND period_end=$3`,
        [subscription.id, subscription.periodStart, subscription.periodEnd],
      );
    const usage = Object.fromEntries(
      ['AI_QUESTIONS', 'TESTS', 'PDF_EXPORTS'].map((metric) => {
        const row = counters.find((c) => c.metric === metric);
        const key =
          metric === 'AI_QUESTIONS'
            ? 'aiQuestions'
            : metric === 'PDF_EXPORTS'
              ? 'pdfExports'
              : 'tests';
        const limitKey =
          metric === 'AI_QUESTIONS'
            ? 'aiQuestionsPerPeriod'
            : metric === 'PDF_EXPORTS'
              ? 'pdfExportsPerPeriod'
              : 'testsPerPeriod';
        const used = Number(row?.used ?? 0),
          reserved = Number(row?.reserved ?? 0),
          limit = subscription.limits[limitKey] ?? null;
        return [
          key,
          {
            limit,
            used,
            reserved,
            remaining: limit === null ? null : Math.max(0, limit - used - reserved),
          },
        ];
      }),
    );
    const [storage] = await this.data.query(
      `SELECT COALESCE((SELECT SUM(v.file_size) FROM document_versions v JOIN knowledge_documents d ON d.id=v.document_id WHERE ($1::uuid IS NOT NULL AND d.school_id=$1) OR ($1::uuid IS NULL AND d.created_by=$2)),0)::text "documents", COALESCE((SELECT SUM(e.size_bytes) FROM test_exports e JOIN tests t ON t.id=e.test_id WHERE e.status='COMPLETED' AND (($1::uuid IS NOT NULL AND t.school_id=$1) OR ($1::uuid IS NULL AND e.requested_by=$2))),0)::text "pdfExports"`,
      [user.schoolId, user.id],
    );
    const documents = Number(storage.documents),
      pdfExports = Number(storage.pdfExports),
      total = documents + pdfExports,
      limit = subscription.limits.storageBytes ?? null;
    return {
      scope: user.schoolId ? 'SCHOOL' : 'TEACHER',
      schoolId: user.schoolId,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      planName: subscription.planName,
      usage,
      storage: {
        limit,
        used: total,
        reserved: 0,
        remaining: limit === null ? null : Math.max(0, limit - total),
        categories: { documents, pdfExports },
      },
    };
  }
}
