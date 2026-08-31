import { TestRenderMode } from '../src/modules/test-exports/test-export.enums';
import { TestRenderModelService } from '../src/modules/test-exports/test-render-model.service';
import { TestStatus } from '../src/modules/tests/test.enums';

describe('TestRenderModel security boundary', () => {
  const finalized = {
    id: 'test',
    title: 'Math',
    description: null,
    instructions: null,
    language: 'en',
    durationMinutes: 30,
    totalMarks: 1,
    totalQuestions: 1,
    finalizedAt: new Date(),
    status: TestStatus.FINALIZED,
    curriculumClass: { name: 'Class 1', board: { name: 'Board' } },
    subject: { name: 'Math' },
    section: null,
    school: null,
    creator: { name: 'Teacher' },
  };
  const snapshot = {
    position: 1,
    type: 'MCQ',
    questionTextSnapshot: '2 + 2?',
    marksSnapshot: 1,
    difficultySnapshot: 'EASY',
    optionsSnapshot: [
      { optionText: '3', optionOrder: 1, isCorrect: false },
      { optionText: '4', optionOrder: 2, isCorrect: true },
    ],
    answerSnapshot: { correctOptionOrders: [2] },
    explanationSnapshot: 'Addition',
  };
  const query = {
    innerJoinAndSelect: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn().mockResolvedValue(finalized),
  };
  query.innerJoinAndSelect.mockReturnValue(query);
  query.leftJoinAndSelect.mockReturnValue(query);
  query.where.mockReturnValue(query);
  const service = new TestRenderModelService(
    { createQueryBuilder: jest.fn().mockReturnValue(query) } as never,
    { find: jest.fn().mockResolvedValue([snapshot]) } as never,
  );

  it('excludes answer fields from QUESTION_PAPER and includes them in ANSWER_KEY', async () => {
    const paper = await service.build('test', TestRenderMode.QUESTION_PAPER);
    expect(paper.questions[0]).not.toHaveProperty('answer');
    expect(paper.questions[0]!.options).toEqual([
      { label: 'A', text: '3' },
      { label: 'B', text: '4' },
    ]);
    const key = await service.build('test', TestRenderMode.ANSWER_KEY);
    expect(key.questions[0]!.answer).toBe('B. 4');
    expect(key.questions[0]!.explanation).toBe('Addition');
  });
});
