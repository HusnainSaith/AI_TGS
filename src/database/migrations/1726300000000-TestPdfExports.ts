import { MigrationInterface, QueryRunner } from 'typeorm';
export class TestPdfExports1726300000000 implements MigrationInterface {
  name = 'TestPdfExports1726300000000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TYPE test_export_type AS ENUM ('QUESTION_PAPER','ANSWER_KEY');CREATE TYPE test_export_status AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','ARCHIVED')`,
    );
    await q.query(
      `CREATE TABLE test_exports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),test_id uuid NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,type test_export_type NOT NULL,status test_export_status NOT NULL DEFAULT 'PENDING',storage_key varchar(300),filename varchar(180) NOT NULL,mime_type varchar(80) NOT NULL DEFAULT 'application/pdf',size_bytes bigint CHECK(size_bytes IS NULL OR size_bytes>0),sha256 varchar(64),render_version varchar(64) NOT NULL,test_snapshot_version integer NOT NULL CHECK(test_snapshot_version>0),usage_reservation_id uuid REFERENCES usage_reservations(id) ON DELETE RESTRICT,idempotency_key varchar(180),error_code varchar(80),processing_token uuid,lease_expires_at timestamptz,started_at timestamptz,completed_at timestamptz,failed_at timestamptz,download_count integer NOT NULL DEFAULT 0 CHECK(download_count>=0),last_downloaded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),CHECK((status='COMPLETED' AND storage_key IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL AND completed_at IS NOT NULL) OR status<>'COMPLETED'));CREATE INDEX test_exports_test_idx ON test_exports(test_id,created_at DESC);CREATE INDEX test_exports_requester_idx ON test_exports(requested_by);CREATE INDEX test_exports_status_idx ON test_exports(status);CREATE INDEX test_exports_cache_idx ON test_exports(test_id,type,render_version,status);CREATE UNIQUE INDEX test_exports_idempotency_idx ON test_exports(requested_by,idempotency_key) WHERE idempotency_key IS NOT NULL`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `DROP TABLE test_exports;DROP TYPE test_export_status;DROP TYPE test_export_type`,
    );
  }
}
