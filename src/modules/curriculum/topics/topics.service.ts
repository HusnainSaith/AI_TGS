import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Chapter, Topic } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { CreateTopicDto, TopicsQueryDto, UpdateTopicDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class TopicsService {
  constructor(
    @InjectRepository(Topic) private readonly repo: Repository<Topic>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  private async activeChapter(id: string) {
    const chapter = await this.chapters
      .createQueryBuilder('chapter')
      .innerJoinAndSelect('chapter.subject', 'subject')
      .innerJoinAndSelect('subject.curriculumClass', 'class')
      .innerJoinAndSelect('subject.board', 'board')
      .where('chapter.id = :id', { id })
      .andWhere(
        'chapter.status = :active AND subject.status = :active AND class.status = :active AND board.status = :active',
        { active: CurriculumStatus.ACTIVE },
      )
      .getOne();
    if (!chapter) throw new NotFoundException('Active Chapter hierarchy not found');
    return chapter;
  }
  async create(dto: CreateTopicDto, actorId: string) {
    await this.activeChapter(dto.chapterId);
    try {
      return await this.data.transaction(async (m) => {
        const e = await m.getRepository(Topic).save({ ...dto, name: dto.name.trim() });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'topic',
            entityId: e.id,
            metadata: { chapterId: e.chapterId, name: e.name, order: e.order },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Topic with this name already exists in the Chapter');
    }
  }
  async list(q: TopicsQueryDto) {
    if (q.chapterId) {
      const chapter = await this.activeChapter(q.chapterId);
      const subject = chapter.subject;
      if (q.subjectId && subject.id !== q.subjectId)
        throw new BadRequestException('Chapter does not belong to the specified Subject');
      if (q.classId && subject.classId !== q.classId)
        throw new BadRequestException('Chapter does not belong to the specified Class');
      if (q.boardId && subject.boardId !== q.boardId)
        throw new BadRequestException('Chapter does not belong to the specified Board');
    }
    const qb = this.repo
      .createQueryBuilder('topic')
      .innerJoin('topic.chapter', 'chapter')
      .innerJoin('chapter.subject', 'subject')
      .where('topic.status = :status', { status: q.status });
    if (q.chapterId) qb.andWhere('topic.chapterId = :chapterId', { chapterId: q.chapterId });
    if (q.subjectId) qb.andWhere('chapter.subjectId = :subjectId', { subjectId: q.subjectId });
    if (q.classId) qb.andWhere('subject.classId = :classId', { classId: q.classId });
    if (q.boardId) qb.andWhere('subject.boardId = :boardId', { boardId: q.boardId });
    if (q.search)
      qb.andWhere('(topic.name ILIKE :search OR topic.description ILIKE :search)', {
        search: `%${q.search}%`,
      });
    qb.orderBy(
      orderColumn(
        q.sortBy,
        { name: 'topic.name', order: 'topic.order', createdAt: 'topic.createdAt' },
        'topic.order',
      ),
      q.sortOrder,
    ).addOrderBy('topic.createdAt', 'ASC');
    return paginate(qb, q);
  }
  async find(id: string, active = true) {
    const e = await this.repo.findOneBy(active ? { id, status: CurriculumStatus.ACTIVE } : { id });
    if (!e) throw new NotFoundException('Topic not found');
    return e;
  }
  async update(id: string, dto: UpdateTopicDto, actorId: string) {
    await this.find(id, true);
    if (dto.chapterId) await this.activeChapter(dto.chapterId);
    try {
      return await this.data.transaction(async (m) => {
        await m.getRepository(Topic).update(id, dto);
        const e = await m.getRepository(Topic).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'topic',
            entityId: id,
            metadata: { fields: Object.keys(dto) },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Topic with this name already exists in the Chapter');
    }
  }
  async archive(id: string, actorId: string) {
    await this.find(id, true);
    return this.data.transaction(async (m) => {
      await m.getRepository(Topic).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'topic', entityId: id },
        m,
      );
    });
  }
}
