import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolGovernanceReportingBranding1726700000000 implements MigrationInterface {
  name = 'SchoolGovernanceReportingBranding1726700000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "question_visibility" AS ENUM ('PRIVATE','SCHOOL','GLOBAL')`);
    await q.query(
      `ALTER TABLE "questions" ADD "visibility" "question_visibility" NOT NULL DEFAULT 'PRIVATE'`,
    );
    await q.query(`ALTER TABLE "questions" ADD "shared_school_id" uuid`);
    await q.query(`ALTER TABLE "questions" ADD "published_at" timestamptz`);
    await q.query(
      `ALTER TABLE "questions" ADD CONSTRAINT "FK_questions_shared_school" FOREIGN KEY ("shared_school_id") REFERENCES "schools"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE INDEX "IDX_questions_shared_school_visibility" ON "questions" ("shared_school_id","visibility","status","review_status")`,
    );
    await q.query(`ALTER TABLE "schools" ADD "footer" text`);
    await q.query(`ALTER TABLE "tests" ADD "branding_snapshot" jsonb`);
    await q.query(
      `CREATE TABLE "school_curriculum_publications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "school_id" uuid NOT NULL, "chapter_id" uuid, "topic_id" uuid, "published_by" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "CHK_school_curriculum_target" CHECK (("chapter_id" IS NOT NULL)::int + ("topic_id" IS NOT NULL)::int = 1), CONSTRAINT "UQ_school_curriculum_chapter" UNIQUE ("school_id","chapter_id"), CONSTRAINT "UQ_school_curriculum_topic" UNIQUE ("school_id","topic_id"), CONSTRAINT "PK_school_curriculum_publications" PRIMARY KEY ("id"), CONSTRAINT "FK_scp_school" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE, CONSTRAINT "FK_scp_chapter" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE, CONSTRAINT "FK_scp_topic" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE, CONSTRAINT "FK_scp_user" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT)`,
    );
    await q.query(
      `CREATE INDEX "IDX_scp_school" ON "school_curriculum_publications" ("school_id","created_at")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "school_curriculum_publications"`);
    await q.query(`ALTER TABLE "tests" DROP COLUMN "branding_snapshot"`);
    await q.query(`ALTER TABLE "schools" DROP COLUMN "footer"`);
    await q.query(`DROP INDEX "IDX_questions_shared_school_visibility"`);
    await q.query(`ALTER TABLE "questions" DROP CONSTRAINT "FK_questions_shared_school"`);
    await q.query(`ALTER TABLE "questions" DROP COLUMN "published_at"`);
    await q.query(`ALTER TABLE "questions" DROP COLUMN "shared_school_id"`);
    await q.query(`ALTER TABLE "questions" DROP COLUMN "visibility"`);
    await q.query(`DROP TYPE "question_visibility"`);
  }
}
