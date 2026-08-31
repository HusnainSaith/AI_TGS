/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EntitlementException, ResolvedEntitlement } from './entitlement.service';
import { EntitlementErrorCode, ReservationStatus, UsageEventType } from './subscription.enums';
@Injectable()
export class UsageService {
  constructor(
    private readonly data: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  async reserve(
    ent: ResolvedEntitlement,
    amount: number,
    referenceType: string,
    referenceId: string,
    actorId: string,
    manager?: EntityManager,
  ) {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new EntitlementException(EntitlementErrorCode.ENTITLEMENT_CONFIGURATION_ERROR);
    const run = async (m: EntityManager) => {
      await m.query(
        `INSERT INTO usage_counters(subscription_id,metric,used,reserved,period_start,period_end) VALUES($1,$2,0,0,$3,$4) ON CONFLICT(subscription_id,metric,period_start,period_end) DO NOTHING`,
        [ent.subscriptionId, ent.metric, ent.periodStart, ent.periodEnd],
      );
      const existing = await m.query(
        `SELECT * FROM usage_reservations WHERE reference_type=$1 AND reference_id=$2 AND metric=$3`,
        [referenceType, referenceId, ent.metric],
      );
      if (existing.length) return existing[0];
      const [counter] = await m.query(
        `SELECT * FROM usage_counters WHERE subscription_id=$1 AND metric=$2 AND period_start=$3 AND period_end=$4 FOR UPDATE`,
        [ent.subscriptionId, ent.metric, ent.periodStart, ent.periodEnd],
      );
      if (
        ent.limit !== null &&
        Number(counter.used) + Number(counter.reserved) + amount > ent.limit
      )
        throw new EntitlementException(EntitlementErrorCode.USAGE_LIMIT_EXCEEDED);
      const ttl = this.config.get<number>('subscription.reservationTtlMinutes') ?? 30;
      const [reservation] = await m.query(
        `INSERT INTO usage_reservations(subscription_id,usage_counter_id,metric,amount,status,reference_type,reference_id,idempotency_key,expires_at) VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7,now()+($8||' minutes')::interval) RETURNING *`,
        [
          ent.subscriptionId,
          counter.id,
          ent.metric,
          amount,
          referenceType,
          referenceId,
          `${referenceType}:${referenceId}:${ent.metric}`,
          ttl,
        ],
      );
      await m.query(`UPDATE usage_counters SET reserved=reserved+$2,updated_at=now() WHERE id=$1`, [
        counter.id,
        amount,
      ]);
      await this.ledger(m, reservation, UsageEventType.RESERVE, amount, 'reserve');
      await this.audit.record(
        {
          actorId,
          action: 'usage.reserve',
          entityType: 'usage_reservation',
          entityId: reservation.id,
          metadata: { metric: ent.metric, amount, referenceType, referenceId },
        },
        m,
      );
      return reservation;
    };
    return manager ? run(manager) : this.data.transaction(run);
  }
  async settleGeneration(jobId: string, actorId?: string) {
    return this.data.transaction(async (m) => {
      const [r] = await m.query(
        `SELECT * FROM usage_reservations WHERE reference_type='GENERATION_JOB' AND reference_id=$1 AND metric='AI_QUESTIONS' FOR UPDATE`,
        [jobId],
      );
      if (!r) return null;
      if (
        [ReservationStatus.SETTLED, ReservationStatus.RELEASED, ReservationStatus.EXPIRED].includes(
          r.status,
        )
      )
        return r;
      const [c] = await m.query(`SELECT * FROM usage_counters WHERE id=$1 FOR UPDATE`, [
        r.usage_counter_id,
      ]);
      const [{ count }] = await m.query(
        `SELECT count(*)::int count FROM questions WHERE generation_job_id=$1 AND source='AI_GENERATED'`,
        [jobId],
      );
      const settled = Number(count);
      if (settled > Number(r.amount)) throw new Error('USAGE_SETTLEMENT_EXCEEDS_RESERVATION');
      const released = Number(r.amount) - settled;
      await m.query(
        `UPDATE usage_counters SET used=used+$2,reserved=reserved-$3,updated_at=now() WHERE id=$1`,
        [c.id, settled, Number(r.amount)],
      );
      const [updated] = await m.query(
        `UPDATE usage_reservations SET settled_amount=$2,released_amount=$3,status='SETTLED',settled_at=now(),released_at=CASE WHEN $3::bigint>0 THEN now() ELSE released_at END,updated_at=now() WHERE id=$1 RETURNING *`,
        [r.id, settled, released],
      );
      if (settled) await this.ledger(m, r, UsageEventType.SETTLE, settled, 'settle');
      if (released) await this.ledger(m, r, UsageEventType.RELEASE, released, 'release');
      await this.audit.record(
        {
          actorId,
          action: 'usage.settle',
          entityType: 'usage_reservation',
          entityId: r.id,
          metadata: { metric: r.metric, settled, released, referenceId: jobId },
        },
        m,
      );
      return updated;
    });
  }
  async settleRegeneration(itemId: string, attempt: number, actorId?: string) {
    return this.data.transaction(async (m) => {
      const type = `GENERATION_REGEN_${attempt}`;
      const [r] = await m.query(
        `SELECT * FROM usage_reservations WHERE reference_type=$1 AND reference_id=$2 AND metric='AI_QUESTIONS' FOR UPDATE`,
        [type, itemId],
      );
      if (!r) return null;
      if (r.status === ReservationStatus.SETTLED) return r;
      const [c] = await m.query(`SELECT * FROM usage_counters WHERE id=$1 FOR UPDATE`, [
        r.usage_counter_id,
      ]);
      const [{ count }] = await m.query(
        `SELECT count(*)::int count FROM questions WHERE generation_job_item_id=$1 AND source='AI_GENERATED' AND created_at>=$2`,
        [itemId, r.created_at],
      );
      const settled = Math.min(Number(count), Number(r.amount)),
        released = Number(r.amount) - settled;
      await m.query(
        `UPDATE usage_counters SET used=used+$2,reserved=reserved-$3,updated_at=now() WHERE id=$1`,
        [c.id, settled, Number(r.amount)],
      );
      const [updated] = await m.query(
        `UPDATE usage_reservations SET settled_amount=$2,released_amount=$3,status='SETTLED',settled_at=now(),released_at=CASE WHEN $3::bigint>0 THEN now() END,updated_at=now() WHERE id=$1 RETURNING *`,
        [r.id, settled, released],
      );
      if (settled) await this.ledger(m, r, UsageEventType.SETTLE, settled, 'settle');
      if (released) await this.ledger(m, r, UsageEventType.RELEASE, released, 'release');
      await this.audit.record(
        {
          actorId,
          action: 'usage.settle',
          entityType: 'usage_reservation',
          entityId: r.id,
          metadata: { settled, released, regeneration: true },
        },
        m,
      );
      return updated;
    });
  }
  async expire(actorId?: string) {
    return this.data.transaction(async (m) => {
      const rows = await m.query(
        `SELECT r.* FROM usage_reservations r LEFT JOIN generation_jobs j ON r.reference_type='GENERATION_JOB' AND j.id=r.reference_id WHERE r.status='ACTIVE' AND r.expires_at<=now() AND NOT(j.status='PROCESSING' AND j.lease_expires_at>now()) FOR UPDATE OF r SKIP LOCKED`,
      );
      for (const r of rows) {
        await m.query(
          `UPDATE usage_counters SET reserved=reserved-$2,updated_at=now() WHERE id=$1`,
          [r.usage_counter_id, Number(r.amount) - Number(r.settled_amount)],
        );
        await m.query(
          `UPDATE usage_reservations SET status='EXPIRED',released_amount=amount-settled_amount,released_at=now(),updated_at=now() WHERE id=$1`,
          [r.id],
        );
        await this.ledger(
          m,
          r,
          UsageEventType.EXPIRE,
          Number(r.amount) - Number(r.settled_amount),
          'expire',
        );
        await this.audit.record(
          {
            actorId,
            action: 'usage.expire',
            entityType: 'usage_reservation',
            entityId: r.id,
            metadata: { amount: Number(r.amount) - Number(r.settled_amount) },
          },
          m,
        );
      }
      return { expired: rows.length };
    });
  }
  private ledger(
    m: EntityManager,
    r: any,
    eventType: UsageEventType,
    amount: number,
    suffix: string,
  ) {
    return m.query(
      `INSERT INTO usage_ledger(subscription_id,metric,event_type,amount,reservation_id,reference_type,reference_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}') ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        r.subscription_id,
        r.metric,
        eventType,
        amount,
        r.id,
        r.reference_type,
        r.reference_id,
        `${r.id}:${suffix}`,
      ],
    );
  }
}
