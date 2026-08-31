import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration } from './config/configuration';
import { envSchema } from './config/env.validation';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RolesGuard } from './common/guards/roles.guard';
import { VerifiedEmailGuard } from './common/guards/verified-email.guard';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { HealthModule } from './modules/health/health.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { UsersModule } from './modules/users/users.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { EmbeddingsModule } from './modules/embeddings/embeddings.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { AiGenerationModule } from './modules/ai-generation/ai-generation.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    QueueModule,
    SchoolsModule,
    UsersModule,
    AuditModule,
    AuthModule,
    CurriculumModule,
    HealthModule,
    QuestionsModule,
    KnowledgeBaseModule,
    IngestionModule,
    EmbeddingsModule,
    RetrievalModule,
    AiGenerationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: VerifiedEmailGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
