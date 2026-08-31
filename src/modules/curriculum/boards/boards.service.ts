import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { Board } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { CreateBoardDto, PaginationQueryDto, UpdateBoardDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board) private readonly repo: Repository<Board>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  async create(dto: CreateBoardDto, actorId: string) {
    try {
      return await this.data.transaction(async (m) => {
        const entity = await m
          .getRepository(Board)
          .save(m.getRepository(Board).create({ ...dto, name: dto.name.trim() }));
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'board',
            entityId: entity.id,
            metadata: { name: entity.name },
          },
          m,
        );
        return entity;
      });
    } catch (e) {
      translateUnique(e, 'Board with this name already exists');
    }
  }
  async list(q: PaginationQueryDto) {
    const qb = this.repo
      .createQueryBuilder('board')
      .where('board.status = :status', { status: q.status });
    if (q.search) qb.andWhere('board.name ILIKE :search', { search: `%${q.search}%` });
    qb.orderBy(
      orderColumn(
        q.sortBy,
        { name: 'board.name', createdAt: 'board.createdAt', updatedAt: 'board.updatedAt' },
        'board.name',
      ),
      q.sortOrder,
    );
    return paginate(qb, q);
  }
  async findActive(id: string) {
    const entity = await this.repo.findOneBy({ id, status: CurriculumStatus.ACTIVE });
    if (!entity) throw new NotFoundException('Board not found');
    return entity;
  }
  async find(id: string) {
    return this.findActive(id);
  }
  async update(id: string, dto: UpdateBoardDto, actorId: string) {
    await this.findActive(id);
    try {
      return await this.data.transaction(async (m) => {
        await m.getRepository(Board).update(id, dto);
        const entity = await m.getRepository(Board).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'board',
            entityId: id,
            metadata: { fields: Object.keys(dto) },
          },
          m,
        );
        return entity;
      });
    } catch (e) {
      translateUnique(e, 'Board with this name already exists');
    }
  }
  async archive(id: string, actorId: string) {
    await this.findActive(id);
    return this.data.transaction(async (m) => {
      await m.getRepository(Board).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'board', entityId: id },
        m,
      );
    });
  }
}
