import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Chapter, Subject } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { ChaptersQueryDto, CreateChapterDto, UpdateChapterDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class ChaptersService {
  constructor(
    @InjectRepository(Chapter) private readonly repo: Repository<Chapter>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  private async activeSubject(id: string) {
    if (!(await this.subjects.existsBy({ id, status: CurriculumStatus.ACTIVE })))
      throw new NotFoundException('Active Subject not found');
  }
  async create(dto: CreateChapterDto, actorId: string) {
    await this.activeSubject(dto.subjectId);
    try {
      return await this.data.transaction(async (m) => {
        const e = await m.getRepository(Chapter).save({ ...dto, name: dto.name.trim() });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'chapter',
            entityId: e.id,
            metadata: { subjectId: e.subjectId, chapterNumber: e.chapterNumber, name: e.name },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Chapter number or name already exists in the Subject');
    }
  }
  async list(q: ChaptersQueryDto) {
    if (q.subjectId) await this.activeSubject(q.subjectId);
    const qb = this.repo
      .createQueryBuilder('chapter')
      .where('chapter.status = :status', { status: q.status });
    if (q.subjectId) qb.andWhere('chapter.subjectId = :subjectId', { subjectId: q.subjectId });
    if (q.search)
      qb.andWhere('(chapter.name ILIKE :search OR chapter.description ILIKE :search)', {
        search: `%${q.search}%`,
      });
    qb.orderBy(
      orderColumn(
        q.sortBy,
        {
          name: 'chapter.name',
          chapterNumber: 'chapter.chapterNumber',
          createdAt: 'chapter.createdAt',
        },
        'chapter.chapterNumber',
      ),
      q.sortOrder,
    );
    return paginate(qb, q);
  }
  async find(id: string, active = true) {
    const e = await this.repo.findOneBy(active ? { id, status: CurriculumStatus.ACTIVE } : { id });
    if (!e) throw new NotFoundException('Chapter not found');
    return e;
  }
  async update(id: string, dto: UpdateChapterDto, actorId: string) {
    await this.find(id, true);
    if (dto.subjectId) await this.activeSubject(dto.subjectId);
    try {
      return await this.data.transaction(async (m) => {
        await m.getRepository(Chapter).update(id, dto);
        const e = await m.getRepository(Chapter).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'chapter',
            entityId: id,
            metadata: { fields: Object.keys(dto) },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Chapter number or name already exists in the Subject');
    }
  }
  async archive(id: string, actorId: string) {
    await this.find(id, true);
    return this.data.transaction(async (m) => {
      await m.getRepository(Chapter).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'chapter', entityId: id },
        m,
      );
    });
  }
}
