import { MigrationInterface, QueryRunner } from 'typeorm';
export class NotificationFoundation1726500000000 implements MigrationInterface {
  name = 'NotificationFoundation1726500000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TYPE notification_type AS ENUM ('EMAIL_VERIFICATION','PASSWORD_RESET','PASSWORD_CHANGED','AI_GENERATION_COMPLETED','AI_GENERATION_FAILED','TEST_FINALIZED','PDF_EXPORT_COMPLETED','PDF_EXPORT_FAILED','SUBSCRIPTION_ACTIVATED','SUBSCRIPTION_PAYMENT_SUCCEEDED','SUBSCRIPTION_PAYMENT_FAILED','SUBSCRIPTION_CANCELLED','SUBSCRIPTION_EXPIRED','SYSTEM');CREATE TYPE notification_delivery_status AS ENUM ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')`,
    );
    await q.query(
      `CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,type notification_type NOT NULL,title varchar(160) NOT NULL,message text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',deduplication_key varchar(220) NOT NULL UNIQUE,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());CREATE INDEX notifications_user_created_idx ON notifications(user_id,created_at DESC);CREATE INDEX notifications_unread_idx ON notifications(user_id,read_at) WHERE read_at IS NULL`,
    );
    await q.query(
      `CREATE TABLE notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,channel varchar(20) NOT NULL DEFAULT 'EMAIL',recipient varchar(320) NOT NULL,status notification_delivery_status NOT NULL DEFAULT 'PENDING',attempt_count integer NOT NULL DEFAULT 0,max_attempts integer NOT NULL DEFAULT 3,next_attempt_at timestamptz NOT NULL DEFAULT now(),processing_token uuid,processing_started_at timestamptz,last_attempt_at timestamptz,sent_at timestamptz,failed_at timestamptz,error_code varchar(80),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(attempt_count>=0 AND max_attempts BETWEEN 1 AND 10));CREATE INDEX notification_deliveries_due_idx ON notification_deliveries(status,next_attempt_at);CREATE INDEX notification_deliveries_lease_idx ON notification_deliveries(status,processing_started_at)`,
    );
    await q.query(
      `CREATE TABLE notification_preferences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,email_enabled boolean NOT NULL DEFAULT true,product_email_enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `DROP TABLE notification_preferences;DROP TABLE notification_deliveries;DROP TABLE notifications;DROP TYPE notification_delivery_status;DROP TYPE notification_type`,
    );
  }
}
