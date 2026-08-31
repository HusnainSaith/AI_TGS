import { QuestionType } from '../questions/enums/question.enums';
export const marksFor = (type: QuestionType): number =>
  ({
    [QuestionType.MCQ]: 1,
    [QuestionType.TRUE_FALSE]: 1,
    [QuestionType.FILL_BLANK]: 1,
    [QuestionType.SHORT]: 2,
    [QuestionType.LONG]: 5,
  })[type];
