import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Topic } from '../curriculum/curriculum.entities';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { QuestionCitation } from './entities/question-citation.entity';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionValidatorService } from './question-validator.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Question, QuestionOption, QuestionCitation, Topic]),
    AuditModule,
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionValidatorService],
  exports: [QuestionsService, QuestionValidatorService],
})
export class QuestionsModule {}
