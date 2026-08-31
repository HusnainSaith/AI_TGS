import { MigrationInterface, QueryRunner } from 'typeorm';
export class TransactionalSubscriptions1726100000000 implements MigrationInterface {
  name = 'TransactionalSubscriptions1726100000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TYPE billing_interval AS ENUM ('MONTHLY','YEARLY'); CREATE TYPE subscription_status AS ENUM ('TRIALING','ACTIVE','PAST_DUE','CANCELLED','EXPIRED'); CREATE TYPE usage_metric AS ENUM ('AI_QUESTIONS','TESTS','PDF_EXPORTS','STORAGE_BYTES'); CREATE TYPE usage_reservation_status AS ENUM ('ACTIVE','PARTIALLY_SETTLED','SETTLED','RELEASED','EXPIRED'); CREATE TYPE usage_event_type AS ENUM ('RESERVE','SETTLE','RELEASE','EXPIRE','ADJUST')`,
    );
    await q.query(
      `CREATE TABLE plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(60) NOT NULL,code varchar(60) NOT NULL UNIQUE,description text,price numeric(10,2) NOT NULL CHECK(price>=0),currency varchar(3) NOT NULL DEFAULT 'USD',billing_interval billing_interval NOT NULL,is_active boolean NOT NULL DEFAULT true,is_default boolean NOT NULL DEFAULT false,limits jsonb NOT NULL,features jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(jsonb_typeof(limits)='object'))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX plans_one_default_idx ON plans(is_default) WHERE is_default; CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE RESTRICT,school_id uuid REFERENCES schools(id) ON DELETE RESTRICT,plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,status subscription_status NOT NULL,current_period_start timestamptz NOT NULL,current_period_end timestamptz NOT NULL,cancel_at_period_end boolean NOT NULL DEFAULT false,cancelled_at timestamptz,provider varchar(40),provider_customer_id varchar(120),provider_subscription_id varchar(120),metadata jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK((user_id IS NULL)<>(school_id IS NULL)),CHECK(current_period_end>current_period_start)); CREATE INDEX subscriptions_user_idx ON subscriptions(user_id); CREATE INDEX subscriptions_school_idx ON subscriptions(school_id)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX subscriptions_active_user_idx ON subscriptions(user_id) WHERE user_id IS NOT NULL AND status IN ('ACTIVE','TRIALING'); CREATE UNIQUE INDEX subscriptions_active_school_idx ON subscriptions(school_id) WHERE school_id IS NOT NULL AND status IN ('ACTIVE','TRIALING')`,
    );
    await q.query(
      `CREATE TABLE usage_counters(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,metric usage_metric NOT NULL,used bigint NOT NULL DEFAULT 0 CHECK(used>=0),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(period_end>period_start),UNIQUE(subscription_id,metric,period_start,period_end))`,
    );
    await q.query(
      `CREATE TABLE usage_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,usage_counter_id uuid NOT NULL REFERENCES usage_counters(id) ON DELETE RESTRICT,metric usage_metric NOT NULL,amount bigint NOT NULL CHECK(amount>0),settled_amount bigint NOT NULL DEFAULT 0 CHECK(settled_amount>=0),released_amount bigint NOT NULL DEFAULT 0 CHECK(released_amount>=0),status usage_reservation_status NOT NULL,reference_type varchar(40) NOT NULL,reference_id uuid NOT NULL,idempotency_key varchar(160) NOT NULL UNIQUE,expires_at timestamptz NOT NULL,settled_at timestamptz,released_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(settled_amount+released_amount<=amount),UNIQUE(reference_type,reference_id,metric)); CREATE INDEX usage_reservations_expiry_idx ON usage_reservations(status,expires_at)`,
    );
    await q.query(
      `CREATE TABLE usage_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,metric usage_metric NOT NULL,event_type usage_event_type NOT NULL,amount bigint NOT NULL CHECK(amount>=0),reservation_id uuid REFERENCES usage_reservations(id) ON DELETE RESTRICT,reference_type varchar(40) NOT NULL,reference_id uuid NOT NULL,idempotency_key varchar(180) NOT NULL UNIQUE,metadata jsonb,created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX usage_ledger_subscription_idx ON usage_ledger(subscription_id,metric,created_at)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `DROP TABLE usage_ledger; DROP TABLE usage_reservations; DROP TABLE usage_counters; DROP TABLE subscriptions; DROP TABLE plans; DROP TYPE usage_event_type; DROP TYPE usage_reservation_status; DROP TYPE usage_metric; DROP TYPE subscription_status; DROP TYPE billing_interval`,
    );
  }
}
