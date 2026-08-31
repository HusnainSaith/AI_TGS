import { MigrationInterface, QueryRunner } from 'typeorm';
export class CurriculumLifecycle1725100000000 implements MigrationInterface {
  name = 'CurriculumLifecycle1725100000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE curriculum_status AS ENUM ('ACTIVE','ARCHIVED')`);
    for (const table of ['boards', 'classes', 'sections', 'subjects', 'chapters', 'topics']) {
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN status curriculum_status NOT NULL DEFAULT 'ACTIVE'`,
      );
      await q.query(`CREATE INDEX ${table}_status_idx ON ${table}(status)`);
    }
    await q.query(`CREATE UNIQUE INDEX boards_name_unique_ci ON boards(lower(btrim(name)))`);
    await q.query(
      `CREATE UNIQUE INDEX classes_board_name_unique_ci ON classes(board_id,lower(btrim(name)))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX sections_class_name_unique_ci ON sections(class_id,lower(btrim(name)))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX subjects_class_name_language_unique_ci ON subjects(class_id,lower(btrim(name)),lower(language))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX chapters_subject_name_unique_ci ON chapters(subject_id,lower(btrim(name)))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX topics_chapter_name_unique_ci ON topics(chapter_id,lower(btrim(name)))`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const index of [
      'topics_chapter_name_unique_ci',
      'chapters_subject_name_unique_ci',
      'subjects_class_name_language_unique_ci',
      'sections_class_name_unique_ci',
      'classes_board_name_unique_ci',
      'boards_name_unique_ci',
    ])
      await q.query(`DROP INDEX IF EXISTS ${index}`);
    for (const table of ['topics', 'chapters', 'subjects', 'sections', 'classes', 'boards'])
      await q.query(`ALTER TABLE ${table} DROP COLUMN status`);
    await q.query(`DROP TYPE curriculum_status`);
  }
}
