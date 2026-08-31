import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Board, CurriculumClass, Subject } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { CreateSubjectDto, SubjectsQueryDto, UpdateSubjectDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject) private readonly repo: Repository<Subject>,
    @InjectRepository(CurriculumClass) private readonly classes: Repository<CurriculumClass>,
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  private async validateHierarchy(boardId: string, classId: string) {
    if (!(await this.boards.existsBy({ id: boardId, status: CurriculumStatus.ACTIVE })))
      throw new NotFoundException('Active Board not found');
    const cls = await this.classes.findOneBy({ id: classId, status: CurriculumStatus.ACTIVE });
    if (!cls) throw new NotFoundException('Active Class not found');
    if (cls.boardId !== boardId)
      throw new BadRequestException('Class does not belong to the specified Board');
  }
  async create(dto: CreateSubjectDto, actorId: string) {
    await this.validateHierarchy(dto.boardId, dto.classId);
    try {
      return await this.data.transaction(async (m) => {
        const e = await m
          .getRepository(Subject)
          .save({ ...dto, name: dto.name.trim(), language: dto.language.toLowerCase() });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'subject',
            entityId: e.id,
            metadata: { boardId: e.boardId, classId: e.classId, name: e.name },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Subject with this name and language already exists in the Class');
    }
  }
  async list(q: SubjectsQueryDto) {
    if (q.boardId && q.classId) await this.validateHierarchy(q.boardId, q.classId);
    const qb = this.repo
      .createQueryBuilder('subject')
      .where('subject.status = :status', { status: q.status });
    if (q.boardId) qb.andWhere('subject.boardId = :boardId', { boardId: q.boardId });
    if (q.classId) qb.andWhere('subject.classId = :classId', { classId: q.classId });
    if (q.language)
      qb.andWhere('subject.language = :language', { language: q.language.toLowerCase() });
    if (q.search)
      qb.andWhere('(subject.name ILIKE :search OR subject.description ILIKE :search)', {
        search: `%${q.search}%`,
      });
    qb.orderBy(
      orderColumn(
        q.sortBy,
        { name: 'subject.name', language: 'subject.language', createdAt: 'subject.createdAt' },
        'subject.name',
      ),
      q.sortOrder,
    );
    return paginate(qb, q);
  }
  async find(id: string, active = true) {
    const e = await this.repo.findOneBy(active ? { id, status: CurriculumStatus.ACTIVE } : { id });
    if (!e) throw new NotFoundException('Subject not found');
    return e;
  }
  async update(id: string, dto: UpdateSubjectDto, actorId: string) {
    const current = await this.find(id, true);
    const boardId = dto.boardId ?? current.boardId;
    const classId = dto.classId ?? current.classId;
    await this.validateHierarchy(boardId, classId);
    try {
      return await this.data.transaction(async (m) => {
        await m
          .getRepository(Subject)
          .update(id, { ...dto, language: dto.language?.toLowerCase() });
        const e = await m.getRepository(Subject).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'subject',
            entityId: id,
            metadata: { fields: Object.keys(dto) },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Subject with this name and language already exists in the Class');
    }
  }
  async archive(id: string, actorId: string) {
    await this.find(id, true);
    return this.data.transaction(async (m) => {
      await m.getRepository(Subject).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'subject', entityId: id },
        m,
      );
    });
  }
}
