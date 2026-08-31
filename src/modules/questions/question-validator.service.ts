import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionOptionDto } from './dto/question.dto';
import { QuestionType } from './enums/question.enums';
@Injectable()
export class QuestionValidatorService {
  validate(type: QuestionType, options: QuestionOptionDto[] | undefined): void {
    if (type === QuestionType.MCQ) {
      this.validateObjective(options, 4, false);
      return;
    }
    if (type === QuestionType.TRUE_FALSE) {
      this.validateObjective(options, 2, true);
      return;
    }
    if (options?.length)
      throw new BadRequestException(`${type} questions must not contain options`);
  }
  private validateObjective(
    options: QuestionOptionDto[] | undefined,
    count: number,
    trueFalse: boolean,
  ): void {
    if (!options || options.length !== count)
      throw new BadRequestException(
        `${trueFalse ? 'TRUE_FALSE' : 'MCQ'} questions require exactly ${count} options`,
      );
    const orders = new Set(options.map((o) => o.optionOrder));
    if (orders.size !== count || [...orders].some((order) => order < 1 || order > count))
      throw new BadRequestException(
        `Option order must contain each value from 1 to ${count} exactly once`,
      );
    if (options.filter((o) => o.isCorrect).length !== 1)
      throw new BadRequestException('Exactly one option must be correct');
    const normalized = options.map((o) =>
      o.optionText.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
    );
    if (new Set(normalized).size !== count)
      throw new BadRequestException('Option text must be logically unique');
    if (normalized.some((text) => text.length === 0))
      throw new BadRequestException('Option text must not be blank');
    if (
      trueFalse &&
      new Set(normalized).size === 2 &&
      !(normalized.includes('true') && normalized.includes('false'))
    )
      throw new BadRequestException('TRUE_FALSE options must be TRUE and FALSE');
  }
}
