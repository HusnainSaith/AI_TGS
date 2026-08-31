import { MigrationInterface, QueryRunner } from 'typeorm';
export class CurriculumMappingReview1725600000000 implements MigrationInterface {
  name = 'CurriculumMappingReview1725600000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE kb_mapping_status AS ENUM ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','ARCHIVED')`,
    );
    await q.query(
      `CREATE TABLE document_topic_mappings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,board_id uuid NOT NULL REFERENCES boards(id) ON DELETE RESTRICT,class_id uuid REFERENCES classes(id) ON DELETE RESTRICT,subject_id uuid REFERENCES subjects(id) ON DELETE RESTRICT,chapter_id uuid REFERENCES chapters(id) ON DELETE RESTRICT,topic_id uuid REFERENCES topics(id) ON DELETE RESTRICT,status kb_mapping_status NOT NULL DEFAULT 'DRAFT',mapped_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,approved_at timestamptz,rejection_reason varchar(500),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(class_id IS NOT NULL OR (subject_id IS NULL AND chapter_id IS NULL AND topic_id IS NULL)),CHECK(subject_id IS NOT NULL OR (chapter_id IS NULL AND topic_id IS NULL)),CHECK(chapter_id IS NOT NULL OR topic_id IS NULL),CHECK((status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status<>'APPROVED'))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX document_topic_mappings_logical_unique ON document_topic_mappings(document_version_id,board_id,COALESCE(class_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(chapter_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(topic_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status <> 'ARCHIVED'`,
    );
    await q.query(
      `CREATE INDEX document_topic_mappings_version_status_idx ON document_topic_mappings(document_version_id,status)`,
    );
    await q.query(
      `CREATE INDEX document_topic_mappings_scope_idx ON document_topic_mappings(board_id,class_id,subject_id,chapter_id,topic_id,status)`,
    );
    await q.query(
      `CREATE INDEX document_topic_mappings_mapped_by_idx ON document_topic_mappings(mapped_by)`,
    );
    await q.query(
      `CREATE INDEX document_topic_mappings_approved_by_idx ON document_topic_mappings(approved_by) WHERE approved_by IS NOT NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE document_topic_mappings`);
    await q.query(`DROP TYPE kb_mapping_status`);
  }
}
