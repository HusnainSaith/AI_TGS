import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CurriculumClass, Section, Subject } from '../curriculum/curriculum.entities';
import { Question } from '../questions/entities/question.entity';
import { QuestionCitation } from '../questions/entities/question-citation.entity';
import { QuestionOption } from '../questions/entities/question-option.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TestQuestion } from './entities/test-question.entity';
import { ExamTest } from './entities/test.entity';
import { TestSnapshotService } from './test-snapshot.service';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TestSection } from './entities/test-section.entity';
import { TestSectionsService } from './test-sections.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamTest,
      TestQuestion,
      Question,
      QuestionOption,
      QuestionCitation,
      CurriculumClass,
      Section,
      Subject,
      TestSection,
    ]),
    AuditModule,
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [TestsController],
  providers: [TestsService, TestSnapshotService, TestSectionsService],
  exports: [TestsService],
})
export class TestsModule {}
