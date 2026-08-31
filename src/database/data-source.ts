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
import { DocumentTopicMapping } from '../modules/knowledge-base/entities/document-topic-mapping.entity';
import { ContentChunkEmbedding } from '../modules/embeddings/entities/content-chunk-embedding.entity';
import { EmbeddingJob } from '../modules/embeddings/entities/embedding-job.entity';
import { RetrievalEvent } from '../modules/retrieval/entities/retrieval-event.entity';
import { RetrievalEventChunk } from '../modules/retrieval/entities/retrieval-event-chunk.entity';
import { GenerationJob } from '../modules/ai-generation/entities/generation-job.entity';
import { GenerationJobItem } from '../modules/ai-generation/entities/generation-job-item.entity';
import { QuestionCitation } from '../modules/questions/entities/question-citation.entity';
import { Plan } from '../modules/subscriptions/entities/plan.entity';
import { Subscription } from '../modules/subscriptions/entities/subscription.entity';
import { UsageCounter } from '../modules/subscriptions/entities/usage-counter.entity';
import { UsageReservation } from '../modules/subscriptions/entities/usage-reservation.entity';
import { UsageLedger } from '../modules/subscriptions/entities/usage-ledger.entity';
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
    DocumentTopicMapping,
    ContentChunkEmbedding,
    EmbeddingJob,
    RetrievalEvent,
    RetrievalEventChunk,
    GenerationJob,
    GenerationJobItem,
    QuestionCitation,
    Plan,
    Subscription,
    UsageCounter,
    UsageReservation,
    UsageLedger,
  ],
  migrations: ['src/database/migrations/*.ts'],
});
