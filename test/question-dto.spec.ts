import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQuestionDto } from '../src/modules/questions/dto/question.dto';
describe('Question DTO', () => {
  const base = {
    topicId: '11111111-1111-4111-8111-111111111111',
    chapterId: '22222222-2222-4222-8222-222222222222',
    subjectId: '33333333-3333-4333-8333-333333333333',
    classId: '44444444-4444-4444-8444-444444444444',
    type: 'SHORT',
    questionText: '  Explain velocity.  ',
    difficulty: 'MEDIUM',
    marks: 2,
  };
  it('trims and accepts a valid manual question payload', async () => {
    const dto = plainToInstance(CreateQuestionDto, base);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.questionText).toBe('Explain velocity.');
  });
  it.each([
    { ...base, questionText: '   ' },
    { ...base, marks: 0 },
    { ...base, type: 'ESSAY' },
    { ...base, difficulty: 'IMPOSSIBLE' },
  ])('rejects invalid general fields', async (input) =>
    expect(await validate(plainToInstance(CreateQuestionDto, input))).not.toHaveLength(0),
  );
  it('rejects internal ownership and provenance fields through the global whitelist contract', () => {
    expect(CreateQuestionDto.prototype).not.toHaveProperty('createdBy');
    expect(CreateQuestionDto.prototype).not.toHaveProperty('source');
    expect(CreateQuestionDto.prototype).not.toHaveProperty('reviewStatus');
    expect(CreateQuestionDto.prototype).not.toHaveProperty('groundingStatus');
  });
});
