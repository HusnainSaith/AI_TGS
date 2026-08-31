import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { CurriculumClass, Section } from '../curriculum.entities';
import { CurriculumStatus } from '../curriculum-status.enum';
import { CreateSectionDto, SectionsQueryDto, UpdateSectionDto } from '../dto/curriculum.dto';
import { orderColumn, paginate, translateUnique } from '../curriculum.utils';
@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section) private readonly repo: Repository<Section>,
    @InjectRepository(CurriculumClass) private readonly classes: Repository<CurriculumClass>,
    private readonly data: DataSource,
    private readonly audit: AuditService,
  ) {}
  private async activeClass(id: string) {
    if (!(await this.classes.existsBy({ id, status: CurriculumStatus.ACTIVE })))
      throw new NotFoundException('Active Class not found');
  }
  async create(dto: CreateSectionDto, actorId: string) {
    await this.activeClass(dto.classId);
    try {
      return await this.data.transaction(async (m) => {
        const e = await m.getRepository(Section).save({ ...dto, name: dto.name.trim() });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.create',
            entityType: 'section',
            entityId: e.id,
            metadata: { classId: e.classId, name: e.name },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Section with this name already exists in the Class');
    }
  }
  async list(q: SectionsQueryDto) {
    if (q.classId) await this.activeClass(q.classId);
    const qb = this.repo
      .createQueryBuilder('section')
      .where('section.status = :status', { status: q.status });
    if (q.classId) qb.andWhere('section.classId = :classId', { classId: q.classId });
    if (q.search) qb.andWhere('section.name ILIKE :search', { search: `%${q.search}%` });
    qb.orderBy(
      orderColumn(
        q.sortBy,
        { name: 'section.name', createdAt: 'section.createdAt' },
        'section.name',
      ),
      q.sortOrder,
    );
    return paginate(qb, q);
  }
  async find(id: string, active = true) {
    const e = await this.repo.findOneBy(active ? { id, status: CurriculumStatus.ACTIVE } : { id });
    if (!e) throw new NotFoundException('Section not found');
    return e;
  }
  async update(id: string, dto: UpdateSectionDto, actorId: string) {
    await this.find(id, true);
    if (dto.classId) await this.activeClass(dto.classId);
    try {
      return await this.data.transaction(async (m) => {
        await m.getRepository(Section).update(id, dto);
        const e = await m.getRepository(Section).findOneByOrFail({ id });
        await this.audit.record(
          {
            actorId,
            action: 'curriculum.update',
            entityType: 'section',
            entityId: id,
            metadata: { fields: Object.keys(dto) },
          },
          m,
        );
        return e;
      });
    } catch (e) {
      translateUnique(e, 'Section with this name already exists in the Class');
    }
  }
  async archive(id: string, actorId: string) {
    await this.find(id, true);
    return this.data.transaction(async (m) => {
      await m.getRepository(Section).update(id, { status: CurriculumStatus.ARCHIVED });
      await this.audit.record(
        { actorId, action: 'curriculum.archive', entityType: 'section', entityId: id },
        m,
      );
    });
  }
}
