import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Board, CurriculumClass } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { ClassesQueryDto, CreateClassDto, UpdateClassDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(CurriculumClass) private readonly repo: Repository<CurriculumClass>,
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  private async activeBoard(id: string) {
    if (!(await this.boards.existsBy({ id, status: CurriculumStatus.ACTIVE })))
      throw new NotFoundException('Active Board not found');
  }
  async create(dto: CreateClassDto, actorId: string) {
    await this.activeBoard(dto.boardId);
    try {
      return await this.data.transaction(async (m) => {
        const entity = await m
          .getRepository(CurriculumClass)
          .save({ ...dto, name: dto.name.trim(), createdBy: actorId });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'class',
            entityId: entity.id,
            metadata: { boardId: entity.boardId, name: entity.name },
          },
          m,
        );
        return entity;
      });
    } catch (e) {
      translateUnique(e, 'Class with this name already exists in the Board');
    }
  }
  async list(q: ClassesQueryDto) {
    if (q.boardId) await this.activeBoard(q.boardId);
    const qb = this.repo
      .createQueryBuilder('class')
      .where('class.status = :status', { status: q.status });
    if (q.boardId) qb.andWhere('class.boardId = :boardId', { boardId: q.boardId });
    if (q.search) qb.andWhere('class.name ILIKE :search', { search: `%${q.search}%` });
    qb.orderBy(
      orderColumn(q.sortBy, { name: 'class.name', createdAt: 'class.createdAt' }, 'class.name'),
      q.sortOrder,
    );
    return paginate(qb, q);
  }
  async findActive(id: string) {
    const entity = await this.repo.findOneBy({ id, status: CurriculumStatus.ACTIVE });
    if (!entity) throw new NotFoundException('Class not found');
    return entity;
  }
  async find(id: string) {
    return this.findActive(id);
  }
  async update(id: string, dto: UpdateClassDto, actorId: string) {
    const current = await this.findActive(id);
    if (dto.boardId) await this.activeBoard(dto.boardId);
    try {
      return await this.data.transaction(async (m) => {
        await m.getRepository(CurriculumClass).update(id, dto);
        const entity = await m.getRepository(CurriculumClass).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'class',
            entityId: id,
            metadata: { fromBoardId: current.boardId, fields: Object.keys(dto) },
          },
          m,
        );
        return entity;
      });
    } catch (e) {
      translateUnique(e, 'Class with this name already exists in the Board');
    }
  }
  async archive(id: string, actorId: string) {
    await this.findActive(id);
    return this.data.transaction(async (m) => {
      await m.getRepository(CurriculumClass).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'class', entityId: id },
        m,
      );
    });
  }
}
