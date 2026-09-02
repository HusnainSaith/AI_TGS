import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QuestionsModule } from '../questions/questions.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AiGenerationController } from './ai-generation.controller';
import { AiGenerationService } from './ai-generation.service';
import { DeterministicTestAiGenerationProvider } from './deterministic-test-ai-generation.provider';
import { GenerationJobItem } from './entities/generation-job-item.entity';
import { GenerationJob } from './entities/generation-job.entity';
import { AI_GENERATION_PROVIDER } from './generation.contracts';
import { GenerationCurriculumService } from './generation-curriculum.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { GenerationOutputValidator } from './generation-output-validator.service';
import { GenerationUnitExpander } from './generation-unit-expander.service';
import { GroundedPromptBuilder } from './grounded-prompt-builder.service';
import { NearDuplicateDetector } from './near-duplicate-detector';
import { OpenAiGenerationProvider } from './openai-generation.provider';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([GenerationJob, GenerationJobItem]),
    AuditModule,
    SubscriptionsModule,
    EmbeddingsModule,
    QuestionsModule,
    RetrievalModule,
    NotificationsModule,
  ],
  controllers: [AiGenerationController],
  providers: [
    AiGenerationService,
    GenerationCurriculumService,
    GenerationUnitExpander,
    GroundedPromptBuilder,
    GenerationOutputValidator,
    NearDuplicateDetector,
    {
      provide: AI_GENERATION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('aiGeneration.provider') === 'test'
          ? new DeterministicTestAiGenerationProvider()
          : new OpenAiGenerationProvider(config),
    },
  ],
})
export class AiGenerationModule {}
