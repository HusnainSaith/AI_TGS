import { BadRequestException } from '@nestjs/common';
import { CurriculumStatus } from '../src/modules/curriculum/curriculum-status.enum';
import { CurriculumMappingValidator } from '../src/modules/knowledge-base/curriculum-mapping-validator.service';
const repo = (items: Record<string, unknown>[]) => ({
  findOneBy: jest.fn(({ id }: { id: string }) =>
    Promise.resolve(items.find((x) => x.id === id) ?? null),
  ),
});
describe('CurriculumMappingValidator', () => {
  const active = { status: CurriculumStatus.ACTIVE };
  const make = () =>
    new CurriculumMappingValidator(
      repo([{ id: 'b', ...active }]) as never,
      repo([
        { id: 'c', boardId: 'b', ...active },
        { id: 'cx', boardId: 'x', ...active },
      ]) as never,
      repo([{ id: 's', classId: 'c', boardId: 'b', ...active }]) as never,
      repo([{ id: 'h', subjectId: 's', ...active }]) as never,
      repo([
        { id: 't', chapterId: 'h', ...active },
        { id: 'ta', chapterId: 'h', status: CurriculumStatus.ARCHIVED },
      ]) as never,
    );
  it.each([
    { boardId: 'b' },
    { boardId: 'b', classId: 'c' },
    { boardId: 'b', classId: 'c', subjectId: 's' },
    { boardId: 'b', classId: 'c', subjectId: 's', chapterId: 'h' },
    { boardId: 'b', classId: 'c', subjectId: 's', chapterId: 'h', topicId: 't' },
  ])('accepts a valid partial path', async (path) =>
    expect(make().validate(path)).resolves.toBeUndefined(),
  );
  it('rejects missing parents, mismatches, and archived nodes', async () => {
    await expect(make().validate({ boardId: 'b', topicId: 't' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(make().validate({ boardId: 'b', classId: 'cx' })).rejects.toThrow(
      'Class does not belong',
    );
    await expect(
      make().validate({
        boardId: 'b',
        classId: 'c',
        subjectId: 's',
        chapterId: 'h',
        topicId: 'ta',
      }),
    ).rejects.toThrow('Archived curriculum');
  });
});
