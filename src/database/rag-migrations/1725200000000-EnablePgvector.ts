import { MigrationInterface, QueryRunner } from 'typeorm';
export class EnablePgvector1725200000000 implements MigrationInterface {
  name = 'EnablePgvector1725200000000';
  async up(q: QueryRunner): Promise<void> {
    try {
      await q.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (error) {
      throw new Error(
        `pgvector is not installed on this PostgreSQL server. Install the extension for this PostgreSQL version, then rerun migration:run:rag. Core curriculum migrations are independent. Cause: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
