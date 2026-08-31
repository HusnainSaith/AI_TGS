import { MigrationInterface, QueryRunner } from 'typeorm';
export class BillingFoundation1726400000000 implements MigrationInterface {
  name = 'BillingFoundation1726400000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TYPE subscription_origin AS ENUM ('MANUAL','PROVIDER');ALTER TABLE subscriptions ADD COLUMN origin subscription_origin NOT NULL DEFAULT 'MANUAL',ADD COLUMN provider_state_updated_at timestamptz;CREATE UNIQUE INDEX subscriptions_provider_id_idx ON subscriptions(provider,provider_subscription_id) WHERE provider_subscription_id IS NOT NULL`,
    );
    await q.query(
      `CREATE TABLE plan_provider_prices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,provider varchar(40) NOT NULL,provider_product_id varchar(120),provider_price_id varchar(120) NOT NULL,currency varchar(3) NOT NULL,billing_interval varchar(20) NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT plan_provider_price_unique UNIQUE(provider,provider_price_id));CREATE INDEX plan_provider_prices_plan_idx ON plan_provider_prices(plan_id)`,
    );
    await q.query(
      `CREATE TABLE billing_customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_type varchar(10) NOT NULL CHECK(owner_type IN ('USER','SCHOOL')),owner_id uuid NOT NULL,provider varchar(40) NOT NULL,provider_customer_id varchar(120) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_type,owner_id,provider),UNIQUE(provider,provider_customer_id))`,
    );
    await q.query(
      `CREATE TABLE billing_checkout_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,owner_type varchar(10) NOT NULL,owner_id uuid NOT NULL,plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,provider varchar(40) NOT NULL,provider_session_id varchar(120) NOT NULL UNIQUE,idempotency_key varchar(120) NOT NULL,status varchar(20) NOT NULL DEFAULT 'OPEN',expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,idempotency_key))`,
    );
    await q.query(
      `CREATE TABLE billing_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider varchar(40) NOT NULL,provider_event_id varchar(120) NOT NULL,event_type varchar(60) NOT NULL,status varchar(20) NOT NULL DEFAULT 'RECEIVED',payload_hash varchar(64) NOT NULL,occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,processing_token uuid,processing_started_at timestamptz,retry_count integer NOT NULL DEFAULT 0,error_code varchar(80),related_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,normalized jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,provider_event_id));CREATE INDEX billing_events_status_idx ON billing_events(status,received_at)`,
    );
    await q.query(
      `CREATE TABLE billing_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,provider varchar(40) NOT NULL,provider_transaction_id varchar(120) NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>=0),currency varchar(3) NOT NULL,status varchar(30) NOT NULL,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,provider_transaction_id));CREATE INDEX billing_transactions_subscription_idx ON billing_transactions(subscription_id,occurred_at DESC)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `DROP TABLE billing_transactions;DROP TABLE billing_events;DROP TABLE billing_checkout_sessions;DROP TABLE billing_customers;DROP TABLE plan_provider_prices;DROP INDEX subscriptions_provider_id_idx;ALTER TABLE subscriptions DROP COLUMN provider_state_updated_at,DROP COLUMN origin;DROP TYPE subscription_origin`,
    );
  }
}
