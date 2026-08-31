import { MigrationInterface, QueryRunner } from 'typeorm';
export class Foundation1725000000000 implements MigrationInterface {
  name = 'Foundation1725000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await q.query(
      `CREATE TYPE user_role AS ENUM ('TEACHER','SCHOOL_ADMIN','SYSTEM_ADMIN','STUDENT')`,
    );
    await q.query(`CREATE TYPE user_status AS ENUM ('ACTIVE','SUSPENDED','DELETED')`);
    await q.query(
      `CREATE TYPE auth_token_type AS ENUM ('REFRESH','EMAIL_VERIFICATION','PASSWORD_RESET')`,
    );
    await q.query(
      `CREATE TABLE schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(150) NOT NULL, logo_url text, address text, phone varchar(30), email varchar(150), website varchar(150), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid REFERENCES schools(id) ON DELETE SET NULL, name varchar(120) NOT NULL, email varchar(150) NOT NULL, phone varchar(30), password_hash varchar(255) NOT NULL, role user_role NOT NULL, profile_image text, email_verified boolean NOT NULL DEFAULT false, status user_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(`CREATE UNIQUE INDEX users_email_unique_ci ON users (lower(email))`);
    await q.query(
      `CREATE TABLE boards (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL UNIQUE, description text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE classes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), board_id uuid NOT NULL REFERENCES boards(id) ON DELETE RESTRICT, name varchar(60) NOT NULL, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(board_id,name))`,
    );
    await q.query(
      `CREATE TABLE sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, name varchar(30) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(class_id,name))`,
    );
    await q.query(
      `CREATE TABLE subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE RESTRICT, name varchar(80) NOT NULL, language varchar(20) NOT NULL DEFAULT 'en', description text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(class_id,name,language))`,
    );
    await q.query(
      `CREATE TABLE chapters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT, chapter_number int NOT NULL CHECK(chapter_number>0), name varchar(120) NOT NULL, description text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(subject_id,chapter_number))`,
    );
    await q.query(
      `CREATE TABLE topics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT, name varchar(150) NOT NULL, description text, "order" int NOT NULL DEFAULT 0 CHECK("order">=0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(chapter_id,name))`,
    );
    await q.query(
      `CREATE TABLE auth_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash varchar(64) NOT NULL UNIQUE, type auth_token_type NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, consumed_at timestamptz, family_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(`CREATE INDEX auth_tokens_user_type_idx ON auth_tokens(user_id,type)`);
    await q.query(
      `CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL, action varchar(80) NOT NULL, entity_type varchar(60) NOT NULL, entity_id uuid, metadata jsonb, outcome varchar(20) NOT NULL DEFAULT 'SUCCEEDED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(`CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type,entity_id)`);
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'audit_logs',
      'auth_tokens',
      'topics',
      'chapters',
      'subjects',
      'sections',
      'classes',
      'boards',
      'users',
      'schools',
    ])
      await q.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    await q.query(`DROP TYPE IF EXISTS auth_token_type`);
    await q.query(`DROP TYPE IF EXISTS user_status`);
    await q.query(`DROP TYPE IF EXISTS user_role`);
  }
}
