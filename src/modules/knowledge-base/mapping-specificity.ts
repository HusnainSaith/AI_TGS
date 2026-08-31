import { MappingSpecificity } from './enums/knowledge-base.enums';
export interface MappingPath {
  boardId: string;
  classId?: string | null;
  subjectId?: string | null;
  chapterId?: string | null;
  topicId?: string | null;
}
export function mappingSpecificity(path: MappingPath): MappingSpecificity {
  if (path.topicId) return MappingSpecificity.TOPIC;
  if (path.chapterId) return MappingSpecificity.CHAPTER;
  if (path.subjectId) return MappingSpecificity.SUBJECT;
  if (path.classId) return MappingSpecificity.CLASS;
  return MappingSpecificity.BOARD;
}
export function mappingContains(parent: MappingPath, child: MappingPath): boolean {
  return (
    parent.boardId === child.boardId &&
    (!parent.classId || parent.classId === child.classId) &&
    (!parent.subjectId || parent.subjectId === child.subjectId) &&
    (!parent.chapterId || parent.chapterId === child.chapterId) &&
    (!parent.topicId || parent.topicId === child.topicId)
  );
}
export function mostSpecific<T extends MappingPath>(paths: T[]): T | undefined {
  return [...paths].sort((a, b) => mappingSpecificity(b) - mappingSpecificity(a))[0];
}
