import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import {
  AssignQuestionSectionDto,
  CreateTestSectionDto,
  ReorderTestSectionsDto,
  UpdateTestSectionDto,
} from './dto/test.dto';
import { TestQuestion } from './entities/test-question.entity';
import { TestSection } from './entities/test-section.entity';
import { ExamTest } from './entities/test.entity';
import { TestStatus } from './test.enums';

@Injectable()
export class TestSectionsService {
  constructor(
    private data: DataSource,
    private audit: AuditService,
  ) {}
  private async test(id: string, user: AuthenticatedUser, manager: EntityManager) {
    const test = await manager.getRepository(ExamTest).findOneBy({ id });
    if (!test) throw new NotFoundException('Test not found');
    if (user.role !== UserRole.SYSTEM_ADMIN && test.createdBy !== user.id)
      throw new ForbiddenException('Test belongs to another teacher');
    if (test.status !== TestStatus.DRAFT)
      throw new BadRequestException('Only DRAFT Tests may be changed');
    return test;
  }
  list(testId: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      return m.getRepository(TestSection).find({ where: { testId }, order: { position: 'ASC' } });
    });
  }
  create(testId: string, dto: CreateTestSectionDto, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      const repo = m.getRepository(TestSection),
        count = await repo.countBy({ testId }),
        position = dto.position ?? count + 1;
      if (position > count + 1) throw new BadRequestException('Section position is out of range');
      await m.query(
        `UPDATE test_sections SET position=position+1000000 WHERE test_id=$1 AND position >= $2`,
        [testId, position],
      );
      await m.query(
        `UPDATE test_sections SET position=position-999999 WHERE test_id=$1 AND position >= $2+1000000`,
        [testId, position],
      );
      const saved = await repo.save({
        testId,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim() || null,
        position,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.section.create',
          entityType: 'test_section',
          entityId: saved.id,
          metadata: { testId, position },
        },
        m,
      );
      return saved;
    });
  }
  update(testId: string, sectionId: string, dto: UpdateTestSectionDto, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      const repo = m.getRepository(TestSection),
        section = await repo.findOneBy({ id: sectionId, testId });
      if (!section) throw new NotFoundException('Test Section not found');
      if (dto.title !== undefined) section.title = dto.title.trim();
      if (dto.instructions !== undefined) section.instructions = dto.instructions.trim() || null;
      const saved = await repo.save(section);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.section.update',
          entityType: 'test_section',
          entityId: sectionId,
          metadata: { testId, fields: Object.keys(dto) },
        },
        m,
      );
      return saved;
    });
  }
  remove(testId: string, sectionId: string, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      const repo = m.getRepository(TestSection),
        section = await repo.findOneBy({ id: sectionId, testId });
      if (!section) throw new NotFoundException('Test Section not found');
      if (await m.getRepository(TestQuestion).countBy({ testSectionId: sectionId }))
        throw new BadRequestException('Move or remove section questions first');
      if ((await repo.countBy({ testId })) === 1)
        throw new BadRequestException('A Test requires at least one section');
      await repo.remove(section);
      await this.normalize(testId, m);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.section.delete',
          entityType: 'test_section',
          entityId: sectionId,
          metadata: { testId },
        },
        m,
      );
    });
  }
  reorder(testId: string, dto: ReorderTestSectionsDto, user: AuthenticatedUser) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      const rows = await m.getRepository(TestSection).findBy({ testId });
      if (
        rows.length !== dto.items.length ||
        new Set(dto.items.map((x) => x.sectionId)).size !== rows.length ||
        new Set(dto.items.map((x) => x.position)).size !== rows.length ||
        dto.items.some((x) => !rows.some((row) => row.id === x.sectionId))
      )
        throw new BadRequestException('A full unique section reorder is required');
      await m.query(`UPDATE test_sections SET position=position+1000000 WHERE test_id=$1`, [
        testId,
      ]);
      for (const item of dto.items)
        await m.query(`UPDATE test_sections SET position=$3 WHERE id=$1 AND test_id=$2`, [
          item.sectionId,
          testId,
          item.position,
        ]);
      await this.audit.record(
        { actorId: user.id, action: 'test.section.reorder', entityType: 'test', entityId: testId },
        m,
      );
      return m.getRepository(TestSection).find({ where: { testId }, order: { position: 'ASC' } });
    });
  }
  assign(
    testId: string,
    questionId: string,
    dto: AssignQuestionSectionDto,
    user: AuthenticatedUser,
  ) {
    return this.data.transaction(async (m) => {
      await this.test(testId, user, m);
      const section = await m
        .getRepository(TestSection)
        .findOneBy({ id: dto.testSectionId, testId });
      if (!section) throw new BadRequestException('Section does not belong to Test');
      const q = await m.getRepository(TestQuestion).findOneBy({ id: questionId, testId });
      if (!q) throw new NotFoundException('Test Question not found');
      const count = await m.getRepository(TestQuestion).countBy({ testSectionId: section.id });
      const oldSectionId = q.testSectionId;
      const position = dto.position ?? count + 1;
      if (position > count + 1) throw new BadRequestException('Question position is out of range');
      await m.query(`UPDATE test_questions SET position=position+1000000 WHERE id=$1`, [q.id]);
      await m.query(
        `UPDATE test_questions SET position=position+1000000 WHERE test_section_id=$1 AND id<>$2 AND position >= $3`,
        [section.id, q.id, position],
      );
      await m.query(
        `UPDATE test_questions SET position=position-999999 WHERE test_section_id=$1 AND id<>$2 AND position >= $3+1000000`,
        [section.id, q.id, position],
      );
      q.testSectionId = section.id;
      q.position = position;
      await m.getRepository(TestQuestion).save(q);
      if (oldSectionId !== section.id) await this.normalizeQuestions(oldSectionId, m);
      await this.normalizeQuestions(section.id, m);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.question.section.assign',
          entityType: 'test_question',
          entityId: q.id,
          metadata: { testId, testSectionId: section.id },
        },
        m,
      );
      return q;
    });
  }
  private async normalize(testId: string, m: EntityManager) {
    const rows = await m
      .getRepository(TestSection)
      .find({ where: { testId }, order: { position: 'ASC', createdAt: 'ASC' } });
    await m.query(`UPDATE test_sections SET position=position+1000000 WHERE test_id=$1`, [testId]);
    for (let i = 0; i < rows.length; i++)
      await m.getRepository(TestSection).update(rows[i]!.id, { position: i + 1 });
  }
  private async normalizeQuestions(sectionId: string, m: EntityManager) {
    const rows = await m
      .getRepository(TestQuestion)
      .find({ where: { testSectionId: sectionId }, order: { position: 'ASC', createdAt: 'ASC' } });
    await m.query(`UPDATE test_questions SET position=position+1000000 WHERE test_section_id=$1`, [
      sectionId,
    ]);
    for (let i = 0; i < rows.length; i++)
      await m.getRepository(TestQuestion).update(rows[i]!.id, { position: i + 1 });
  }
}
