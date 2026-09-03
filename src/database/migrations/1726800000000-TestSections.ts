import { MigrationInterface, QueryRunner } from 'typeorm';

export class TestSections1726800000000 implements MigrationInterface {
  name = 'TestSections1726800000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "test_sections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(),"test_id" uuid NOT NULL,"title" varchar(160) NOT NULL,"instructions" text,"position" integer NOT NULL,"created_at" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "CHK_test_section_position" CHECK (position>0),CONSTRAINT "UQ_test_section_id_test" UNIQUE("id","test_id"),CONSTRAINT "UQ_test_section_position" UNIQUE("test_id","position"),CONSTRAINT "PK_test_sections" PRIMARY KEY("id"),CONSTRAINT "FK_test_sections_test" FOREIGN KEY("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT)`,
    );
    await q.query(
      `INSERT INTO "test_sections"("test_id","title","instructions","position") SELECT id,'Questions',NULL,1 FROM tests`,
    );
    await q.query(`ALTER TABLE "test_questions" ADD "test_section_id" uuid`);
    await q.query(
      `UPDATE "test_questions" q SET "test_section_id"=s.id FROM "test_sections" s WHERE s.test_id=q.test_id AND s.position=1`,
    );
    await q.query(`ALTER TABLE "test_questions" ALTER COLUMN "test_section_id" SET NOT NULL`);
    await q.query(
      `ALTER TABLE "test_questions" DROP CONSTRAINT "test_questions_test_id_position_key"`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_test_questions_section_position" ON "test_questions"("test_section_id","position")`,
    );
    await q.query(
      `ALTER TABLE "test_questions" ADD CONSTRAINT "FK_test_questions_section_test" FOREIGN KEY("test_section_id","test_id") REFERENCES "test_sections"("id","test_id") ON DELETE RESTRICT`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "test_questions" DROP CONSTRAINT "FK_test_questions_section_test"`);
    await q.query(`DROP INDEX "IDX_test_questions_section_position"`);
    await q.query(
      `WITH ordered AS (SELECT id,row_number() OVER(PARTITION BY test_id ORDER BY test_section_id,position,id) next_position FROM test_questions) UPDATE test_questions q SET position=ordered.next_position FROM ordered WHERE ordered.id=q.id`,
    );
    await q.query(`ALTER TABLE "test_questions" DROP COLUMN "test_section_id"`);
    await q.query(
      `ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_test_id_position_key" UNIQUE("test_id","position")`,
    );
    await q.query(`DROP TABLE "test_sections"`);
  }
}
