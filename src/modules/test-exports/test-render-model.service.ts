import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestQuestion } from '../tests/entities/test-question.entity';
import { ExamTest } from '../tests/entities/test.entity';
import { TestStatus } from '../tests/test.enums';
import { TestRenderMode } from './test-export.enums';
import { RenderQuestion, TestRenderModel } from './test-render-model';
@Injectable()
export class TestRenderModelService {
  constructor(
    @InjectRepository(ExamTest) private tests: Repository<ExamTest>,
    @InjectRepository(TestQuestion) private questions: Repository<TestQuestion>,
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
    if (snapshots.length !== test.totalQuestions)
      throw new BadRequestException('Finalized Test snapshot is inconsistent');
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
      institution: { name: test.school?.name ?? null },
      teacher: { displayName: test.creator.name },
      questions: snapshots.map((q) => this.question(q, mode)),
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
