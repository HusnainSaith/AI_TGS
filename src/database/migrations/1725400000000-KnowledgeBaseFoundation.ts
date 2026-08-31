import { MigrationInterface, QueryRunner } from 'typeorm';
export class KnowledgeBaseFoundation1725400000000 implements MigrationInterface {
  name = 'KnowledgeBaseFoundation1725400000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE kb_tenant_scope AS ENUM ('GLOBAL','SCHOOL')`);
    await q.query(
      `CREATE TYPE kb_document_status AS ENUM ('DRAFT','PROCESSING','READY_FOR_REVIEW','PUBLISHED','FAILED','ARCHIVED')`,
    );
    await q.query(`CREATE TYPE kb_source_type AS ENUM ('PDF','DOCX','TXT','ADMIN_NOTE')`);
    await q.query(
      `CREATE TYPE kb_extraction_status AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED')`,
    );
    await q.query(
      `CREATE TYPE kb_malware_scan_status AS ENUM ('NOT_SCANNED','PENDING','CLEAN','INFECTED','FAILED')`,
    );
    await q.query(
      `CREATE TYPE ingestion_job_status AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED')`,
    );
    await q.query(
      `CREATE TYPE ingestion_step AS ENUM ('UPLOAD_RECEIVED','QUARANTINED','SIGNATURE_VALIDATION','MALWARE_SCAN','TEXT_EXTRACTION','OCR','NORMALIZATION','CHUNKING','EMBEDDING','MAPPING','VERIFICATION','READY_FOR_REVIEW')`,
    );
    await q.query(
      `CREATE TABLE knowledge_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_scope kb_tenant_scope NOT NULL, school_id uuid REFERENCES schools(id) ON DELETE RESTRICT, title varchar(250) NOT NULL CHECK(length(btrim(title))>0), source_type kb_source_type NOT NULL, language varchar(20) NOT NULL DEFAULT 'en', rights_metadata jsonb NOT NULL, status kb_document_status NOT NULL DEFAULT 'DRAFT', active_version_id uuid, created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK ((tenant_scope='GLOBAL' AND school_id IS NULL) OR (tenant_scope='SCHOOL' AND school_id IS NOT NULL)), CHECK (rights_metadata @> '{"permissionConfirmed": true}'::jsonb))`,
    );
    await q.query(
      `CREATE TABLE document_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE RESTRICT, version_no integer NOT NULL CHECK(version_no>0), storage_key text NOT NULL UNIQUE, checksum varchar(64) NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'), mime_type varchar(120) NOT NULL, validated_mime_type varchar(120) NOT NULL, original_filename varchar(255) NOT NULL, file_size bigint NOT NULL CHECK(file_size>0), page_count integer, extraction_status kb_extraction_status NOT NULL DEFAULT 'PENDING', malware_scan_status kb_malware_scan_status NOT NULL DEFAULT 'NOT_SCANNED', published_at timestamptz, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version_no), UNIQUE(document_id,checksum))`,
    );
    await q.query(
      `ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_active_version_fk FOREIGN KEY(active_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE TABLE ingestion_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT, status ingestion_job_status NOT NULL DEFAULT 'QUEUED', current_step ingestion_step NOT NULL, error_code varchar(80), error_message text, metrics jsonb NOT NULL DEFAULT '{}', retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count>=0), started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    for (const [table, column] of [
      ['knowledge_documents', 'tenant_scope'],
      ['knowledge_documents', 'school_id'],
      ['knowledge_documents', 'status'],
      ['knowledge_documents', 'created_by'],
      ['knowledge_documents', 'created_at'],
      ['document_versions', 'document_id'],
      ['document_versions', 'checksum'],
      ['document_versions', 'created_at'],
      ['ingestion_jobs', 'document_version_id'],
      ['ingestion_jobs', 'status'],
      ['ingestion_jobs', 'created_at'],
    ] as const)
      await q.query(`CREATE INDEX ${table}_${column}_idx ON ${table}(${column})`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE knowledge_documents DROP CONSTRAINT knowledge_documents_active_version_fk`,
    );
    await q.query(`DROP TABLE ingestion_jobs`);
    await q.query(`DROP TABLE document_versions`);
    await q.query(`DROP TABLE knowledge_documents`);
    for (const t of [
      'ingestion_step',
      'ingestion_job_status',
      'kb_malware_scan_status',
      'kb_extraction_status',
      'kb_source_type',
      'kb_document_status',
      'kb_tenant_scope',
    ])
      await q.query(`DROP TYPE ${t}`);
  }
}
