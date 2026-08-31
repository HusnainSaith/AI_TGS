import { BadRequestException } from '@nestjs/common';
import { QuestionValidatorService } from '../src/modules/questions/question-validator.service';
import { QuestionType } from '../src/modules/questions/enums/question.enums';
describe('QuestionValidatorService', () => {
  const validator = new QuestionValidatorService();
  const mcq = [1, 2, 3, 4].map((n) => ({
    optionText: `Option ${n}`,
    optionOrder: n,
    isCorrect: n === 2,
  }));
  const tf = [
    { optionText: 'TRUE', optionOrder: 1, isCorrect: true },
    { optionText: 'FALSE', optionOrder: 2, isCorrect: false },
  ];
  it('accepts valid MCQ', () =>
    expect(() => validator.validate(QuestionType.MCQ, mcq)).not.toThrow());
  it.each([
    [mcq.slice(0, 3), 'three'],
    [[...mcq, { optionText: 'Five', optionOrder: 4, isCorrect: false }], 'five'],
  ])('rejects invalid MCQ cardinality', (options) =>
    expect(() => validator.validate(QuestionType.MCQ, options)).toThrow(BadRequestException),
  );
  it('rejects zero or multiple correct MCQ options', () => {
    expect(() =>
      validator.validate(
        QuestionType.MCQ,
        mcq.map((o) => ({ ...o, isCorrect: false })),
      ),
    ).toThrow('Exactly one');
    expect(() =>
      validator.validate(
        QuestionType.MCQ,
        mcq.map((o, i) => ({ ...o, isCorrect: i < 2 })),
      ),
    ).toThrow('Exactly one');
  });
  it('rejects duplicate order and logical text', () => {
    expect(() =>
      validator.validate(
        QuestionType.MCQ,
        mcq.map((o, i) => ({ ...o, optionOrder: i === 3 ? 3 : o.optionOrder })),
      ),
    ).toThrow('Option order');
    expect(() =>
      validator.validate(
        QuestionType.MCQ,
        mcq.map((o, i) => ({ ...o, optionText: i === 3 ? ' option 1 ' : o.optionText })),
      ),
    ).toThrow('logically unique');
  });
  it.each([QuestionType.SHORT, QuestionType.LONG, QuestionType.FILL_BLANK])(
    'accepts %s without options and rejects options',
    (type) => {
      expect(() => validator.validate(type, undefined)).not.toThrow();
      expect(() => validator.validate(type, mcq)).toThrow('must not contain options');
    },
  );
  it('accepts TRUE_FALSE only as TRUE and FALSE with one correct answer', () => {
    expect(() => validator.validate(QuestionType.TRUE_FALSE, tf)).not.toThrow();
    expect(() =>
      validator.validate(
        QuestionType.TRUE_FALSE,
        tf.map((o) => ({ ...o, isCorrect: false })),
      ),
    ).toThrow('Exactly one');
    expect(() =>
      validator.validate(QuestionType.TRUE_FALSE, [
        { optionText: 'Yes', optionOrder: 1, isCorrect: true },
        { optionText: 'FALSE', optionOrder: 2, isCorrect: false },
      ]),
    ).toThrow('TRUE and FALSE');
  });
});
