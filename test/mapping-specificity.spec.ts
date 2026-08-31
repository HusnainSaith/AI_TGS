import {
  mappingContains,
  mappingSpecificity,
  mostSpecific,
} from '../src/modules/knowledge-base/mapping-specificity';
import { MappingSpecificity } from '../src/modules/knowledge-base/enums/knowledge-base.enums';
describe('mapping specificity domain logic', () => {
  const board = { boardId: 'b' };
  const cls = { ...board, classId: 'c' };
  const subject = { ...cls, subjectId: 's' };
  const chapter = { ...subject, chapterId: 'h' };
  const topic = { ...chapter, topicId: 't' };
  it.each([
    [board, MappingSpecificity.BOARD],
    [cls, MappingSpecificity.CLASS],
    [subject, MappingSpecificity.SUBJECT],
    [chapter, MappingSpecificity.CHAPTER],
    [topic, MappingSpecificity.TOPIC],
  ])('derives each hierarchy level', (path, expected) =>
    expect(mappingSpecificity(path)).toBe(expected),
  );
  it('determines containment and the most-specific mapping', () => {
    expect(mappingContains(subject, topic)).toBe(true);
    expect(mappingContains(topic, subject)).toBe(false);
    expect(mostSpecific([board, chapter, topic])).toBe(topic);
  });
});
