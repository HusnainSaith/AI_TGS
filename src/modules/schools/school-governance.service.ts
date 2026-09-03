import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { AuditService } from '../audit/audit.service';
import { Chapter, Topic } from '../curriculum/curriculum.entities';
import { User } from '../users/user.entity';
import {
  ListSchoolTeachersDto,
  PublishCurriculumDto,
  UpdateSchoolBrandingDto,
} from './dto/school-governance.dto';
import { SchoolCurriculumPublication } from './school-curriculum-publication.entity';
import { School } from './school.entity';
import { Inject } from '@nestjs/common';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../../infrastructure/storage/object-storage.provider';

@Injectable()
export class SchoolGovernanceService {
  constructor(
    @InjectRepository(School) private schools: Repository<School>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(SchoolCurriculumPublication)
    private publications: Repository<SchoolCurriculumPublication>,
    private data: DataSource,
    private audit: AuditService,
    @Inject(OBJECT_STORAGE_PROVIDER) private storage: ObjectStorageProvider,
  ) {}
  private schoolId(user: AuthenticatedUser) {
    if (!user.schoolId) throw new ForbiddenException('School membership required');
    return user.schoolId;
  }
  async teachers(query: ListSchoolTeachersDto, user: AuthenticatedUser) {
    const schoolId = this.schoolId(user),
      [items, total] = await this.users.findAndCount({
        where: { schoolId, role: UserRole.TEACHER },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          schoolId: true,
          createdAt: true,
        },
        order: { createdAt: 'DESC' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }
  async teacher(id: string, user: AuthenticatedUser) {
    const row = await this.users.findOne({
      where: { id, schoolId: this.schoolId(user), role: UserRole.TEACHER },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        schoolId: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException('Teacher not found');
    return row;
  }
  async setTeacherStatus(id: string, status: UserStatus, user: AuthenticatedUser) {
    const teacher = await this.teacher(id, user);
    if (status === UserStatus.DELETED)
      throw new BadRequestException('Use remove for membership removal');
    await this.users.update(id, { status });
    await this.audit.record({
      actorId: user.id,
      action: 'school.teacher.status',
      entityType: 'user',
      entityId: id,
      metadata: { schoolId: user.schoolId, previousStatus: teacher.status, status },
    });
    return this.teacher(id, user);
  }
  async removeTeacher(id: string, user: AuthenticatedUser) {
    const teacher = await this.teacher(id, user);
    await this.users.update(id, { schoolId: null, status: UserStatus.SUSPENDED });
    await this.audit.record({
      actorId: user.id,
      action: 'school.teacher.remove',
      entityType: 'user',
      entityId: id,
      metadata: { schoolId: user.schoolId, previousStatus: teacher.status },
    });
  }
  async publishCurriculum(dto: PublishCurriculumDto, user: AuthenticatedUser) {
    if (Boolean(dto.chapterId) === Boolean(dto.topicId))
      throw new BadRequestException('Exactly one curriculum target is required');
    const schoolId = this.schoolId(user);
    if (
      dto.chapterId &&
      !(await this.data.getRepository(Chapter).exist({ where: { id: dto.chapterId } }))
    )
      throw new NotFoundException('Chapter not found');
    if (
      dto.topicId &&
      !(await this.data.getRepository(Topic).exist({ where: { id: dto.topicId } }))
    )
      throw new NotFoundException('Topic not found');
    const qb = this.publications
      .createQueryBuilder('p')
      .where('p.schoolId=:schoolId', { schoolId });
    if (dto.chapterId) qb.andWhere('p.chapterId=:id', { id: dto.chapterId });
    else qb.andWhere('p.topicId=:id', { id: dto.topicId });
    const existing = await qb.getOne();
    if (existing) return existing;
    const saved = await this.publications.save({
      schoolId,
      chapterId: dto.chapterId ?? null,
      topicId: dto.topicId ?? null,
      publishedBy: user.id,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'school.curriculum.publish',
      entityType: 'school_curriculum_publication',
      entityId: saved.id,
      metadata: { schoolId, chapterId: saved.chapterId, topicId: saved.topicId },
    });
    return saved;
  }
  listCurriculum(user: AuthenticatedUser) {
    return this.publications.find({
      where: { schoolId: this.schoolId(user) },
      order: { createdAt: 'DESC' },
    });
  }
  async unpublishCurriculum(id: string, user: AuthenticatedUser) {
    const row = await this.publications.findOneBy({ id, schoolId: this.schoolId(user) });
    if (!row) throw new NotFoundException('Publication not found');
    await this.publications.remove(row);
    await this.audit.record({
      actorId: user.id,
      action: 'school.curriculum.unpublish',
      entityType: 'school_curriculum_publication',
      entityId: id,
      metadata: { schoolId: user.schoolId },
    });
  }
  async updateBranding(dto: UpdateSchoolBrandingDto, user: AuthenticatedUser) {
    const schoolId = this.schoolId(user);
    const school = await this.schools.findOneBy({ id: schoolId });
    if (!school) throw new NotFoundException('School not found');
    Object.assign(school, dto);
    const saved = await this.schools.save(school);
    await this.audit.record({
      actorId: user.id,
      action: 'school.branding.update',
      entityType: 'school',
      entityId: schoolId,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }
  async updateLogo(
    file: { buffer: Buffer; mimetype: string } | undefined,
    user: AuthenticatedUser,
  ) {
    const schoolId = this.schoolId(user);
    if (!file || file.buffer.length === 0 || file.buffer.length > 1024 * 1024)
      throw new BadRequestException('Valid logo file required');
    const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg =
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[file.buffer.length - 2] === 0xff &&
      file.buffer[file.buffer.length - 1] === 0xd9;
    if ((!png && !jpg) || !['image/png', 'image/jpeg'].includes(file.mimetype))
      throw new BadRequestException('Logo must be a valid PNG or JPEG');
    const ext = png ? 'png' : 'jpg',
      key = `school-branding/${schoolId}/logo.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    await this.schools.update(schoolId, { logoUrl: key });
    await this.audit.record({
      actorId: user.id,
      action: 'school.branding.logo.update',
      entityType: 'school',
      entityId: schoolId,
      metadata: { mimeType: file.mimetype, sizeBytes: file.buffer.length },
    });
    return { logoStorageKey: key };
  }
}
