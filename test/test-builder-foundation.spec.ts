import { TestSnapshotService } from '../src/modules/tests/test-snapshot.service';
import {
  QuestionDifficulty,
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
  QuestionType,
  GroundingStatus,
} from '../src/modules/questions/enums/question.enums';
describe('Test Builder snapshots', () => {
  it('preserves ordered objective answers and provenance', async () => {
    const options = {
        find: jest.fn().mockResolvedValue([
          { optionText: 'A', optionOrder: 1, isCorrect: false },
          { optionText: 'B', optionOrder: 2, isCorrect: true },
        ]),
      },
      citations = {
        find: jest.fn().mockResolvedValue([
          {
            documentVersionId: 'v',
            contentChunkId: 'c',
            locator: { page: 1 },
            excerptHash: 'h',
            retrievalScore: 0.9,
            citationOrder: 1,
          },
        ]),
      },
      manager = {
        getRepository: jest.fn((entity: { name: string }) =>
          entity.name === 'QuestionOption' ? options : citations,
        ),
      };
    const q = {
      id: 'q',
      type: QuestionType.TRUE_FALSE,
      questionText: 'Statement',
      marks: 1,
      difficulty: QuestionDifficulty.EASY,
      explanation: 'B',
      source: QuestionSource.AI_GENERATED,
      groundingStatus: GroundingStatus.GROUNDED,
      reviewStatus: QuestionReviewStatus.APPROVED,
      status: QuestionStatus.ACTIVE,
      chapterId: 'ch',
      topicId: 't',
    };
    const snapshot = await new TestSnapshotService().fromQuestion(
      q as never,
      'en',
      manager as never,
    );
    expect(snapshot.optionsSnapshot).toEqual([
      { optionText: 'A', optionOrder: 1, isCorrect: false },
      { optionText: 'B', optionOrder: 2, isCorrect: true },
    ]);
    expect(snapshot.answerSnapshot).toEqual({ correctOptionOrders: [2] });
    expect(snapshot.citationSnapshot).toHaveLength(1);
  });
});
