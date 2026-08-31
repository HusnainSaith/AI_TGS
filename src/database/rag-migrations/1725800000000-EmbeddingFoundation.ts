import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmbeddingFoundation1725800000000 implements MigrationInterface {
  name = 'EmbeddingFoundation1725800000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE embedding_status AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','STALE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE embedding_job_status AS ENUM ('QUEUED','PROCESSING','PARTIAL','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(`CREATE TABLE content_chunk_embeddings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_chunk_id uuid NOT NULL REFERENCES content_chunks(id) ON DELETE CASCADE,
      provider varchar(40) NOT NULL, model varchar(120) NOT NULL, model_version varchar(120), embedding_config_version varchar(64) NOT NULL,
      dimension integer NOT NULL CHECK (dimension = 1536), distance_metric varchar(20) NOT NULL CHECK (distance_metric = 'cosine'),
      content_hash varchar(64) NOT NULL, status embedding_status NOT NULL DEFAULT 'PENDING', embedding vector(1536), embedded_at timestamptz,
      error_code varchar(80), usage_metadata jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_chunk_embedding_config UNIQUE(content_chunk_id, embedding_config_version),
      CONSTRAINT completed_embedding_required CHECK (status <> 'COMPLETED' OR (embedding IS NOT NULL AND embedded_at IS NOT NULL))
    )`);
    await queryRunner.query(
      `CREATE INDEX idx_chunk_embeddings_status ON content_chunk_embeddings(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_chunk_embeddings_config ON content_chunk_embeddings(embedding_config_version)`,
    );
    await queryRunner.query(`CREATE TABLE embedding_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
      provider varchar(40) NOT NULL, model varchar(120) NOT NULL, dimension integer NOT NULL CHECK (dimension = 1536), config_version varchar(64) NOT NULL,
      status embedding_job_status NOT NULL DEFAULT 'QUEUED', total_chunks integer NOT NULL DEFAULT 0, processed_chunks integer NOT NULL DEFAULT 0,
      embedded_chunks integer NOT NULL DEFAULT 0, failed_chunks integer NOT NULL DEFAULT 0, skipped_chunks integer NOT NULL DEFAULT 0,
      input_tokens integer, request_count integer NOT NULL DEFAULT 0, retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
      processing_token uuid, lease_expires_at timestamptz, started_at timestamptz, completed_at timestamptz, error_code varchar(80),
      metrics jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX idx_embedding_jobs_version ON embedding_jobs(document_version_id)`,
    );
    await queryRunner.query(`CREATE INDEX idx_embedding_jobs_status ON embedding_jobs(status)`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS embedding_jobs');
    await queryRunner.query('DROP TABLE IF EXISTS content_chunk_embeddings');
    await queryRunner.query('DROP TYPE IF EXISTS embedding_job_status');
    await queryRunner.query('DROP TYPE IF EXISTS embedding_status');
  }
}
