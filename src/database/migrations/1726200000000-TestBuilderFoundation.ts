import { MigrationInterface, QueryRunner } from 'typeorm';
export class TestBuilderFoundation1726200000000 implements MigrationInterface {
  name = 'TestBuilderFoundation1726200000000';
  async up(q: QueryRunner) {
    await q.query(`CREATE TYPE test_status AS ENUM ('DRAFT','FINALIZED','ARCHIVED')`);
    await q.query(
      `CREATE TABLE tests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,school_id uuid REFERENCES schools(id) ON DELETE RESTRICT,class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,section_id uuid REFERENCES sections(id) ON DELETE RESTRICT,subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,title varchar(160) NOT NULL CHECK(length(btrim(title))>0),description text,instructions text,language varchar(20) NOT NULL DEFAULT 'en',status test_status NOT NULL DEFAULT 'DRAFT',duration_minutes integer CHECK(duration_minutes>0),total_marks numeric(8,2) NOT NULL DEFAULT 0 CHECK(total_marks>=0),total_questions integer NOT NULL DEFAULT 0 CHECK(total_questions>=0),version integer NOT NULL DEFAULT 1 CHECK(version>0),cloned_from_test_id uuid REFERENCES tests(id) ON DELETE RESTRICT,finalized_at timestamptz,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());CREATE INDEX tests_created_by_idx ON tests(created_by);CREATE INDEX tests_status_idx ON tests(status);CREATE INDEX tests_class_idx ON tests(class_id);CREATE INDEX tests_subject_idx ON tests(subject_id);CREATE INDEX tests_created_at_idx ON tests(created_at);CREATE INDEX tests_finalized_at_idx ON tests(finalized_at)`,
    );
    await q.query(
      `CREATE TABLE test_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),test_id uuid NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,source_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,position integer NOT NULL CHECK(position>0),type question_type NOT NULL,question_text_snapshot text NOT NULL CHECK(length(btrim(question_text_snapshot))>0),marks_snapshot numeric(5,2) NOT NULL CHECK(marks_snapshot>0),difficulty_snapshot question_difficulty NOT NULL,language_snapshot varchar(20) NOT NULL,options_snapshot jsonb,answer_snapshot jsonb,explanation_snapshot text,source_snapshot question_source NOT NULL,grounding_status_snapshot grounding_status NOT NULL,review_status_snapshot question_review_status NOT NULL,citation_snapshot jsonb,chapter_id_snapshot uuid NOT NULL,topic_id_snapshot uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(test_id,position),UNIQUE(test_id,source_question_id));CREATE INDEX test_questions_test_idx ON test_questions(test_id);CREATE INDEX test_questions_source_idx ON test_questions(source_question_id)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(`DROP TABLE test_questions;DROP TABLE tests;DROP TYPE test_status`);
  }
}
