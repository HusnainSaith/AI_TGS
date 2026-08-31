import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Question } from '../questions/entities/question.entity';
import { QuestionCitation } from '../questions/entities/question-citation.entity';
import { QuestionOption } from '../questions/entities/question-option.entity';
@Injectable()
export class TestSnapshotService {
  async fromQuestion(q: Question, language: string, manager: EntityManager, marks?: number) {
    const options = await manager
      .getRepository(QuestionOption)
      .find({ where: { questionId: q.id }, order: { optionOrder: 'ASC' } });
    const citations = await manager
      .getRepository(QuestionCitation)
      .find({ where: { questionId: q.id }, order: { citationOrder: 'ASC' } });
    const optionSnapshot = options.length
      ? options.map((o) => ({
          optionText: o.optionText,
          optionOrder: o.optionOrder,
          isCorrect: o.isCorrect,
        }))
      : null;
    const answerSnapshot = optionSnapshot
      ? { correctOptionOrders: optionSnapshot.filter((o) => o.isCorrect).map((o) => o.optionOrder) }
      : q.explanation
        ? { modelAnswer: q.explanation }
        : null;
    return {
      sourceQuestionId: q.id,
      type: q.type,
      questionTextSnapshot: q.questionText,
      marksSnapshot: marks ?? q.marks,
      difficultySnapshot: q.difficulty,
      languageSnapshot: language,
      optionsSnapshot: optionSnapshot,
      answerSnapshot,
      explanationSnapshot: q.explanation,
      sourceSnapshot: q.source,
      groundingStatusSnapshot: q.groundingStatus,
      reviewStatusSnapshot: q.reviewStatus,
      citationSnapshot: citations.length
        ? citations.map((c) => ({
            documentVersionId: c.documentVersionId,
            contentChunkId: c.contentChunkId,
            locator: c.locator,
            excerptHash: c.excerptHash,
            retrievalScore: c.retrievalScore,
            citationOrder: c.citationOrder,
          }))
        : null,
      chapterIdSnapshot: q.chapterId,
      topicIdSnapshot: q.topicId,
    };
  }
}
