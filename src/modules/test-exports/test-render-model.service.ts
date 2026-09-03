import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestQuestion } from '../tests/entities/test-question.entity';
import { ExamTest } from '../tests/entities/test.entity';
import { TestStatus } from '../tests/test.enums';
import { TestRenderMode } from './test-export.enums';
import { RenderQuestion, TestRenderModel } from './test-render-model';
import { TestSection } from '../tests/entities/test-section.entity';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../../infrastructure/storage/object-storage.provider';
@Injectable()
export class TestRenderModelService {
  constructor(
    @InjectRepository(ExamTest) private tests: Repository<ExamTest>,
    @InjectRepository(TestQuestion) private questions: Repository<TestQuestion>,
    @Optional() @InjectRepository(TestSection) private sections?: Repository<TestSection>,
    @Optional() @Inject(OBJECT_STORAGE_PROVIDER) private storage?: ObjectStorageProvider,
  ) {}
  async build(testId: string, mode: TestRenderMode): Promise<TestRenderModel> {
    const test = await this.tests
      .createQueryBuilder('test')
      .innerJoinAndSelect('test.curriculumClass', 'class')
      .innerJoinAndSelect('class.board', 'board')
      .innerJoinAndSelect('test.subject', 'subject')
      .leftJoinAndSelect('test.section', 'section')
      .innerJoinAndSelect('test.creator', 'creator')
      .leftJoinAndSelect('test.school', 'school')
      .where('test.id=:testId', { testId })
      .getOne();
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== TestStatus.FINALIZED || !test.finalizedAt)
      throw new BadRequestException('TEST_NOT_FINALIZED');
    const snapshots = await this.questions.find({ where: { testId }, order: { position: 'ASC' } });
    const sections = this.sections
      ? await this.sections.find({ where: { testId }, order: { position: 'ASC' } })
      : [];
    if (snapshots.length !== test.totalQuestions)
      throw new BadRequestException('Finalized Test snapshot is inconsistent');
    const branding = (test.brandingSnapshot ?? {}) as Record<string, string | null>;
    let logo: Buffer | undefined;
    const logoKey = branding.logoStorageKey;
    if (logoKey && test.schoolId && logoKey.startsWith(`school-branding/${test.schoolId}/`)) {
      const candidate = await this.storage?.getObject(logoKey);
      if (!candidate) throw new BadRequestException('School logo storage is unavailable');
      if (
        candidate.length <= 1024 * 1024 &&
        (candidate.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (candidate[0] === 0xff && candidate[1] === 0xd8))
      )
        logo = candidate;
    }
    return {
      mode,
      test: {
        title: test.title,
        description: test.description,
        instructions: test.instructions,
        language: test.language,
        durationMinutes: test.durationMinutes,
        totalMarks: test.totalMarks,
        totalQuestions: test.totalQuestions,
        finalizedAt: test.finalizedAt,
      },
      curriculum: {
        board: test.curriculumClass.board.name,
        className: test.curriculumClass.name,
        section: test.section?.name ?? null,
        subject: test.subject.name,
      },
      institution: {
        name: branding.name ?? test.school?.name ?? null,
        logo,
        address: branding.address ?? null,
        phone: branding.phone ?? null,
        email: branding.email ?? null,
        website: branding.website ?? null,
        footer: branding.footer ?? null,
      },
      teacher: { displayName: test.creator.name },
      questions: snapshots.map((q) => this.question(q, mode)),
      sections: sections.map((section) => {
        const members = snapshots
          .filter((q) => q.testSectionId === section.id)
          .sort((a, b) => a.position - b.position)
          .map((q) => this.question(q, mode));
        return {
          title: section.title,
          instructions: section.instructions,
          position: section.position,
          marks: members.reduce((sum, q) => sum + q.marks, 0),
          questions: members,
        };
      }),
    };
  }
  private question(q: TestQuestion, mode: TestRenderMode): RenderQuestion {
    const options = (q.optionsSnapshot ?? []).map((o, index) => ({
      label: String.fromCharCode(65 + index),
      text: o.optionText,
    }));
    const base: RenderQuestion = {
      number: q.position,
      type: q.type,
      text: q.questionTextSnapshot,
      marks: q.marksSnapshot,
      difficulty: q.difficultySnapshot,
      options,
    };
    if (mode === TestRenderMode.QUESTION_PAPER) return base;
    const correct = (q.optionsSnapshot ?? [])
      .filter((o) => o.isCorrect)
      .map(
        (o) => `${String.fromCharCode(65 + (q.optionsSnapshot ?? []).indexOf(o))}. ${o.optionText}`,
      )
      .join(', ');
    const modelAnswer = q.answerSnapshot?.modelAnswer;
    return {
      ...base,
      answer: correct || (typeof modelAnswer === 'string' ? modelAnswer : 'Answer unavailable'),
      explanation: q.explanationSnapshot,
    };
  }
}
