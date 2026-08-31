import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board, Chapter, CurriculumClass, Section, Subject, Topic } from './curriculum.entities';
import { AuditModule } from '../audit/audit.module';
import { BoardsController } from './boards/boards.controller';
import { BoardsService } from './boards/boards.service';
import { ClassesController } from './classes/classes.controller';
import { ClassesService } from './classes/classes.service';
import { SectionsController } from './sections/sections.controller';
import { SectionsService } from './sections/sections.service';
import { SubjectsController } from './subjects/subjects.controller';
import { SubjectsService } from './subjects/subjects.service';
import { ChaptersController } from './chapters/chapters.controller';
import { ChaptersService } from './chapters/chapters.service';
import { TopicsController } from './topics/topics.controller';
import { TopicsService } from './topics/topics.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([Board, CurriculumClass, Section, Subject, Chapter, Topic]),
    AuditModule,
  ],
  controllers: [
    BoardsController,
    ClassesController,
    SectionsController,
    SubjectsController,
    ChaptersController,
    TopicsController,
  ],
  providers: [
    BoardsService,
    ClassesService,
    SectionsService,
    SubjectsService,
    ChaptersService,
    TopicsService,
  ],
  exports: [TypeOrmModule],
})
export class CurriculumModule {}
