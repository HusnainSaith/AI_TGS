import { MigrationInterface, QueryRunner } from 'typeorm';
export class GroundedAiGeneration1726000000000 implements MigrationInterface {
  name = 'GroundedAiGeneration1726000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE generation_job_status AS ENUM ('QUEUED','PROCESSING','PARTIAL','COMPLETED','FAILED')`,
    );
    await q.query(
      `CREATE TYPE generation_item_status AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED','INSUFFICIENT_KNOWLEDGE')`,
    );
    await q.query(`CREATE TYPE generation_grounding_mode AS ENUM ('REQUIRED','PREFERRED')`);
    await q.query(
      `CREATE TABLE generation_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,request_payload jsonb NOT NULL,status generation_job_status NOT NULL DEFAULT 'QUEUED',requested_count integer NOT NULL CHECK(requested_count>0),generated_count integer NOT NULL DEFAULT 0 CHECK(generated_count>=0),failed_count integer NOT NULL DEFAULT 0 CHECK(failed_count>=0),provider varchar(40) NOT NULL,model varchar(120) NOT NULL,prompt_strategy_version varchar(64) NOT NULL,retrieval_strategy_version varchar(64) NOT NULL,embedding_config_version varchar(64) NOT NULL,grounding_mode generation_grounding_mode NOT NULL DEFAULT 'REQUIRED',token_usage jsonb,cost numeric(10,4),error_code varchar(80),processing_token uuid,lease_expires_at timestamptz,started_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(`CREATE INDEX generation_jobs_requested_by_idx ON generation_jobs(requested_by)`);
    await q.query(`CREATE INDEX generation_jobs_status_idx ON generation_jobs(status)`);
    await q.query(`CREATE INDEX generation_jobs_created_at_idx ON generation_jobs(created_at)`);
    await q.query(
      `CREATE TABLE generation_job_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),generation_job_id uuid NOT NULL REFERENCES generation_jobs(id) ON DELETE RESTRICT,question_id uuid REFERENCES questions(id) ON DELETE RESTRICT,unit_topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,unit_type question_type NOT NULL,difficulty question_difficulty NOT NULL,requested_count integer NOT NULL CHECK(requested_count>0),generated_count integer NOT NULL DEFAULT 0 CHECK(generated_count>=0),status generation_item_status NOT NULL DEFAULT 'QUEUED',retrieval_event_id uuid REFERENCES retrieval_events(id) ON DELETE RESTRICT,retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count>=0),rejection_reason varchar(120),error_code varchar(80),request_metadata jsonb NOT NULL,processing_token uuid,lease_expires_at timestamptz,started_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX generation_job_items_job_idx ON generation_job_items(generation_job_id)`,
    );
    await q.query(`CREATE INDEX generation_job_items_status_idx ON generation_job_items(status)`);
    await q.query(
      `CREATE INDEX generation_job_items_topic_idx ON generation_job_items(unit_topic_id)`,
    );
    await q.query(
      `ALTER TABLE questions ADD generation_job_item_id uuid REFERENCES generation_job_items(id) ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE questions ADD CONSTRAINT questions_generation_job_fk FOREIGN KEY(generation_job_id) REFERENCES generation_jobs(id) ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE questions ADD CONSTRAINT questions_retrieval_event_fk FOREIGN KEY(retrieval_event_id) REFERENCES retrieval_events(id) ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE TABLE question_citations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,retrieval_event_id uuid NOT NULL REFERENCES retrieval_events(id) ON DELETE RESTRICT,content_chunk_id uuid NOT NULL REFERENCES content_chunks(id) ON DELETE RESTRICT,document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,locator jsonb NOT NULL,excerpt_hash varchar(64) NOT NULL,retrieval_score double precision,citation_order integer NOT NULL CHECK(citation_order>0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(question_id,citation_order))`,
    );
    await q.query(
      `CREATE INDEX question_citations_question_idx ON question_citations(question_id)`,
    );
    await q.query(
      `CREATE INDEX question_citations_retrieval_idx ON question_citations(retrieval_event_id)`,
    );
    await q.query(
      `CREATE INDEX question_citations_chunk_idx ON question_citations(content_chunk_id)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE question_citations`);
    await q.query(`ALTER TABLE questions DROP CONSTRAINT questions_retrieval_event_fk`);
    await q.query(`ALTER TABLE questions DROP CONSTRAINT questions_generation_job_fk`);
    await q.query(`ALTER TABLE questions DROP COLUMN generation_job_item_id`);
    await q.query(`DROP TABLE generation_job_items`);
    await q.query(`DROP TABLE generation_jobs`);
    await q.query(`DROP TYPE generation_grounding_mode`);
    await q.query(`DROP TYPE generation_item_status`);
    await q.query(`DROP TYPE generation_job_status`);
  }
}
