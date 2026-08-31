import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board, Chapter, CurriculumClass, Subject, Topic } from '../curriculum/curriculum.entities';
import { CurriculumStatus } from '../curriculum/curriculum-status.enum';
import { MappingPath } from './mapping-specificity';

@Injectable()
export class CurriculumMappingValidator {
  constructor(
    @InjectRepository(Board) private boards: Repository<Board>,
    @InjectRepository(CurriculumClass) private classes: Repository<CurriculumClass>,
    @InjectRepository(Subject) private subjects: Repository<Subject>,
    @InjectRepository(Chapter) private chapters: Repository<Chapter>,
    @InjectRepository(Topic) private topics: Repository<Topic>,
  ) {}
  async validate(path: MappingPath): Promise<void> {
    if (!path.boardId) throw new BadRequestException('boardId is required');
    if (
      (path.topicId && !path.chapterId) ||
      (path.chapterId && !path.subjectId) ||
      (path.subjectId && !path.classId)
    )
      throw new BadRequestException('Curriculum children require every parent in the path');
    const board = await this.boards.findOneBy({ id: path.boardId });
    if (!board) throw new BadRequestException('Board not found');
    if (board.status !== CurriculumStatus.ACTIVE)
      throw new BadRequestException('Archived curriculum cannot be mapped');
    if (path.classId) {
      const item = await this.classes.findOneBy({ id: path.classId });
      if (!item || item.boardId !== path.boardId)
        throw new BadRequestException('Class does not belong to Board');
      if (item.status !== CurriculumStatus.ACTIVE)
        throw new BadRequestException('Archived curriculum cannot be mapped');
    }
    if (path.subjectId) {
      const item = await this.subjects.findOneBy({ id: path.subjectId });
      if (!item || item.classId !== path.classId || item.boardId !== path.boardId)
        throw new BadRequestException('Subject does not belong to Class and Board');
      if (item.status !== CurriculumStatus.ACTIVE)
        throw new BadRequestException('Archived curriculum cannot be mapped');
    }
    if (path.chapterId) {
      const item = await this.chapters.findOneBy({ id: path.chapterId });
      if (!item || item.subjectId !== path.subjectId)
        throw new BadRequestException('Chapter does not belong to Subject');
      if (item.status !== CurriculumStatus.ACTIVE)
        throw new BadRequestException('Archived curriculum cannot be mapped');
    }
    if (path.topicId) {
      const item = await this.topics.findOneBy({ id: path.topicId });
      if (!item || item.chapterId !== path.chapterId)
        throw new BadRequestException('Topic does not belong to Chapter');
      if (item.status !== CurriculumStatus.ACTIVE)
        throw new BadRequestException('Archived curriculum cannot be mapped');
    }
  }
}
