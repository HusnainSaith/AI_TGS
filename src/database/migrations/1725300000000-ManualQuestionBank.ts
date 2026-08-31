import { MigrationInterface, QueryRunner } from 'typeorm';
export class ManualQuestionBank1725300000000 implements MigrationInterface {
  name = 'ManualQuestionBank1725300000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE question_type AS ENUM ('MCQ','SHORT','LONG','TRUE_FALSE','FILL_BLANK')`,
    );
    await q.query(`CREATE TYPE question_difficulty AS ENUM ('EASY','MEDIUM','HARD')`);
    await q.query(`CREATE TYPE question_source AS ENUM ('MANUAL','AI_GENERATED')`);
    await q.query(`CREATE TYPE question_review_status AS ENUM ('PENDING','APPROVED')`);
    await q.query(`CREATE TYPE question_status AS ENUM ('ACTIVE','ARCHIVED')`);
    await q.query(
      `CREATE TYPE grounding_status AS ENUM ('NOT_APPLICABLE','GROUNDED','UNGROUNDED','INSUFFICIENT_EVIDENCE')`,
    );
    await q.query(
      `CREATE TABLE questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT, chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT, subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT, class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, type question_type NOT NULL, question_text text NOT NULL CHECK(length(btrim(question_text))>0), difficulty question_difficulty NOT NULL, marks numeric(5,2) NOT NULL CHECK(marks>0), explanation text, source question_source NOT NULL, review_status question_review_status NOT NULL, generation_job_id uuid, created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, status question_status NOT NULL DEFAULT 'ACTIVE', grounding_status grounding_status NOT NULL, retrieval_event_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE question_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE, option_text text NOT NULL CHECK(length(btrim(option_text))>0), option_order smallint NOT NULL CHECK(option_order BETWEEN 1 AND 4), is_correct boolean NOT NULL DEFAULT false, UNIQUE(question_id,option_order))`,
    );
    for (const column of [
      'created_by',
      'topic_id',
      'chapter_id',
      'subject_id',
      'class_id',
      'type',
      'difficulty',
      'source',
      'review_status',
      'status',
      'created_at',
    ])
      await q.query(`CREATE INDEX questions_${column}_idx ON questions(${column})`);
    await q.query(`CREATE INDEX question_options_question_id_idx ON question_options(question_id)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE question_options`);
    await q.query(`DROP TABLE questions`);
    for (const type of [
      'grounding_status',
      'question_status',
      'question_review_status',
      'question_source',
      'question_difficulty',
      'question_type',
    ])
      await q.query(`DROP TYPE ${type}`);
  }
}
