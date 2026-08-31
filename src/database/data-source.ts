import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { AuditLog } from '../modules/audit/audit-log.entity';
import { AuthToken } from '../modules/auth/auth-token.entity';
import {
  Board,
  Chapter,
  CurriculumClass,
  Section,
  Subject,
  Topic,
} from '../modules/curriculum/curriculum.entities';
import { School } from '../modules/schools/school.entity';
import { User } from '../modules/users/user.entity';
import { Question } from '../modules/questions/entities/question.entity';
import { QuestionOption } from '../modules/questions/entities/question-option.entity';
import { KnowledgeDocument } from '../modules/knowledge-base/entities/knowledge-document.entity';
import { DocumentVersion } from '../modules/knowledge-base/entities/document-version.entity';
import { IngestionJob } from '../modules/ingestion/entities/ingestion-job.entity';
import { ContentChunk } from '../modules/knowledge-base/entities/content-chunk.entity';
loadEnv();
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? 'tgs',
  username: process.env.DATABASE_USER ?? 'tgs',
  password: process.env.DATABASE_PASSWORD ?? 'tgs_dev_only',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  synchronize: false,
  entities: [
    School,
    User,
    AuthToken,
    Board,
    CurriculumClass,
    Section,
    Subject,
    Chapter,
    Topic,
    AuditLog,
    Question,
    QuestionOption,
    KnowledgeDocument,
    DocumentVersion,
    IngestionJob,
    ContentChunk,
  ],
  migrations: ['src/database/migrations/*.ts'],
});
