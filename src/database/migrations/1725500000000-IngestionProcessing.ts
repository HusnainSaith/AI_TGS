import { MigrationInterface, QueryRunner } from 'typeorm';
export class IngestionProcessing1725500000000 implements MigrationInterface {
  name = 'IngestionProcessing1725500000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE kb_document_status ADD VALUE IF NOT EXISTS 'READY_FOR_MAPPING'`);
    await q.query(`ALTER TYPE kb_malware_scan_status ADD VALUE IF NOT EXISTS 'SCANNING'`);
    await q.query(`ALTER TYPE ingestion_job_status ADD VALUE IF NOT EXISTS 'AWAITING_MAPPING'`);
    await q.query(`ALTER TYPE ingestion_step ADD VALUE IF NOT EXISTS 'READY_FOR_MAPPING'`);
    await q.query(
      `ALTER TABLE ingestion_jobs ADD processing_token uuid, ADD lease_expires_at timestamptz`,
    );
    await q.query(
      `CREATE INDEX ingestion_jobs_processing_lease_idx ON ingestion_jobs(status,lease_expires_at)`,
    );
    await q.query(
      `CREATE TABLE content_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,tenant_scope kb_tenant_scope NOT NULL,school_id uuid REFERENCES schools(id) ON DELETE RESTRICT,board_id uuid REFERENCES boards(id) ON DELETE RESTRICT,class_id uuid REFERENCES classes(id) ON DELETE RESTRICT,subject_id uuid REFERENCES subjects(id) ON DELETE RESTRICT,chapter_id uuid REFERENCES chapters(id) ON DELETE RESTRICT,topic_id uuid REFERENCES topics(id) ON DELETE RESTRICT,content text NOT NULL CHECK(length(btrim(content))>0),content_hash varchar(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),estimated_token_count integer NOT NULL CHECK(estimated_token_count>0),page_from integer CHECK(page_from IS NULL OR page_from>0),page_to integer,section_title text,locator_metadata jsonb NOT NULL,chunk_order integer NOT NULL CHECK(chunk_order>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_version_id,chunk_order),CHECK(page_to IS NULL OR (page_from IS NOT NULL AND page_to>=page_from)),CHECK((tenant_scope='GLOBAL' AND school_id IS NULL) OR (tenant_scope='SCHOOL' AND school_id IS NOT NULL)))`,
    );
    for (const column of [
      'document_version_id',
      'tenant_scope',
      'school_id',
      'content_hash',
      'created_at',
    ])
      await q.query(`CREATE INDEX content_chunks_${column}_idx ON content_chunks(${column})`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE content_chunks`);
    await q.query(`DROP INDEX ingestion_jobs_processing_lease_idx`);
    await q.query(
      `ALTER TABLE ingestion_jobs DROP COLUMN lease_expires_at,DROP COLUMN processing_token`,
    );
  }
}
