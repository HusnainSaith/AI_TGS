import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTopicDto, PaginationQueryDto } from '../src/modules/curriculum/dto/curriculum.dto';
describe('Curriculum DTO validation', () => {
  it('trims strings and applies bounded pagination defaults', async () => {
    const dto = plainToInstance(PaginationQueryDto, { search: '  physics  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20, search: 'physics' });
  });
  it('rejects a negative topic order and invalid chapter UUID', async () => {
    const dto = plainToInstance(CreateTopicDto, { chapterId: 'bad', name: ' Topic ', order: -1 });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(expect.arrayContaining(['chapterId', 'order']));
    expect(dto.name).toBe('Topic');
  });
  it('rejects pagination limits above 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 101 });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
