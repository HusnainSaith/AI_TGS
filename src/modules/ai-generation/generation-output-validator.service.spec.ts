import { BadRequestException } from '@nestjs/common';
import { QuestionValidatorService } from '../questions/question-validator.service';
import { QuestionDifficulty, QuestionType } from '../questions/enums/question.enums';
import { GenerationOutputValidator } from './generation-output-validator.service';

describe('GenerationOutputValidator strict JSON boundary', () => {
  const validator = new GenerationOutputValidator(new QuestionValidatorService());
  const unit = {
    topicId: 'topic',
    chapterId: 'chapter',
    type: QuestionType.SHORT,
    difficulty: QuestionDifficulty.EASY,
    count: 1,
  };
  const valid = JSON.stringify({
    questions: [
      {
        type: 'SHORT',
        questionText: 'What absorbs light?',
        difficulty: 'EASY',
        marks: 2,
        explanation: null,
        options: [],
        citations: ['SRC_1'],
      },
    ],
  });

  it('accepts valid pure JSON after domain validation', () => {
    expect(validator.validate(valid, unit, new Set(['SRC_1']))).toHaveLength(1);
  });

  it.each([`Here is the result: ${valid}`, `\`\`\`json\n${valid}\n\`\`\``, '{bad'])(
    'rejects prefixed, fenced, and malformed JSON',
    (output) => {
      expect(() => validator.validate(output, unit, new Set(['SRC_1']))).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects syntactically valid JSON that violates the application schema', () => {
    expect(() =>
      validator.validate(
        '{"questions":[{"questionText":"missing fields"}]}',
        unit,
        new Set(['SRC_1']),
      ),
    ).toThrow('AI_SCHEMA_VALIDATION_FAILED');
  });
  it('retains valid items and classifies malformed logical slots for targeted recovery', () => {
    const result = validator.validateRecoverable(
      JSON.stringify({ questions: [JSON.parse(valid).questions[0], { questionText: 'bad' }] }),
      { ...unit, count: 2 },
      new Set(['SRC_1']),
    );
    expect(result.questions).toHaveLength(1);
    expect(result.invalidCodes).toEqual(['AI_SCHEMA_VALIDATION_FAILED']);
  });
});
