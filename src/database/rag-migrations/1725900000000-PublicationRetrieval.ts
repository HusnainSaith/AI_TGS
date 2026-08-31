import { MigrationInterface, QueryRunner } from 'typeorm';
export class PublicationRetrieval1725900000000 implements MigrationInterface {
  name = 'PublicationRetrieval1725900000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE document_versions ADD publication_embedding_config_version varchar(64),ADD publication_mapping_snapshot jsonb`,
    );
    await q.query(
      `ALTER TABLE content_chunks ADD search_vector_simple tsvector GENERATED ALWAYS AS (to_tsvector('simple',content)) STORED,ADD search_vector_english tsvector GENERATED ALWAYS AS (to_tsvector('english',content)) STORED`,
    );
    await q.query(
      `CREATE INDEX content_chunks_fts_simple_idx ON content_chunks USING GIN(search_vector_simple)`,
    );
    await q.query(
      `CREATE INDEX content_chunks_fts_english_idx ON content_chunks USING GIN(search_vector_english)`,
    );
    await q.query(
      `DO $$ BEGIN CREATE TYPE retrieval_event_status AS ENUM ('STARTED','COMPLETED','INSUFFICIENT_KNOWLEDGE','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await q.query(
      `CREATE TABLE retrieval_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requested_by uuid REFERENCES users(id) ON DELETE RESTRICT,query_text text NOT NULL,filters jsonb NOT NULL,strategy_version varchar(64) NOT NULL,embedding_config_version varchar(64) NOT NULL,top_k integer NOT NULL CHECK(top_k BETWEEN 1 AND 50),min_similarity double precision NOT NULL CHECK(min_similarity BETWEEN 0 AND 1),vector_weight double precision NOT NULL CHECK(vector_weight>=0),keyword_weight double precision NOT NULL CHECK(keyword_weight>=0),context_budget_tokens integer NOT NULL CHECK(context_budget_tokens>0),candidate_count integer NOT NULL DEFAULT 0,result_count integer NOT NULL DEFAULT 0,status retrieval_event_status NOT NULL,latency_ms integer,failure_code varchar(80),created_at timestamptz NOT NULL DEFAULT now(),CHECK(vector_weight+keyword_weight>0))`,
    );
    await q.query(
      `CREATE INDEX retrieval_events_requested_by_idx ON retrieval_events(requested_by)`,
    );
    await q.query(`CREATE INDEX retrieval_events_status_idx ON retrieval_events(status)`);
    await q.query(`CREATE INDEX retrieval_events_created_at_idx ON retrieval_events(created_at)`);
    await q.query(
      `CREATE TABLE retrieval_event_chunks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),retrieval_event_id uuid NOT NULL REFERENCES retrieval_events(id) ON DELETE RESTRICT,content_chunk_id uuid NOT NULL REFERENCES content_chunks(id) ON DELETE RESTRICT,document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,label varchar(20) NOT NULL,rank integer NOT NULL CHECK(rank>0),vector_score double precision NOT NULL,keyword_score double precision NOT NULL,hybrid_score double precision NOT NULL,estimated_tokens integer NOT NULL CHECK(estimated_tokens>0),content_hash varchar(64) NOT NULL,locator_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(retrieval_event_id,rank),UNIQUE(retrieval_event_id,label))`,
    );
    for (const column of ['retrieval_event_id', 'content_chunk_id', 'document_version_id'])
      await q.query(
        `CREATE INDEX retrieval_event_chunks_${column}_idx ON retrieval_event_chunks(${column})`,
      );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE retrieval_event_chunks`);
    await q.query(`DROP TABLE retrieval_events`);
    await q.query(`DROP TYPE retrieval_event_status`);
    await q.query(`DROP INDEX content_chunks_fts_english_idx`);
    await q.query(`DROP INDEX content_chunks_fts_simple_idx`);
    await q.query(
      `ALTER TABLE content_chunks DROP COLUMN search_vector_english,DROP COLUMN search_vector_simple`,
    );
    await q.query(
      `ALTER TABLE document_versions DROP COLUMN publication_mapping_snapshot,DROP COLUMN publication_embedding_config_version`,
    );
  }
}
