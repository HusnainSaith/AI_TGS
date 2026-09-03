import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionOptionDto } from '../questions/dto/question.dto';
import { QuestionValidatorService } from '../questions/question-validator.service';
import { AiErrorCode } from './generation.enums';
import { GenerationUnit, ProviderQuestion } from './generation.contracts';
import { marksFor } from './question-marks';
@Injectable()
export class GenerationOutputValidator {
  constructor(private readonly validator: QuestionValidatorService) {}
  validate(output: string, unit: GenerationUnit, labels: Set<string>): ProviderQuestion[] {
    const recovered = this.validateRecoverable(output, unit, labels);
    if (recovered.invalidCodes.length || recovered.questions.length !== unit.count)
      throw new BadRequestException(recovered.invalidCodes[0] ?? AiErrorCode.COUNT_MISMATCH);
    return recovered.questions;
  }
  validateRecoverable(output: string, unit: GenerationUnit, labels: Set<string>) {
    let value: unknown;
    try {
      value = JSON.parse(output);
    } catch {
      throw new BadRequestException(AiErrorCode.INVALID_RESPONSE);
    }
    const questions = (value as { questions?: unknown })?.questions;
    if (!Array.isArray(questions))
      throw new BadRequestException(AiErrorCode.SCHEMA_VALIDATION_FAILED);
    const valid: ProviderQuestion[] = [],
      invalidCodes: string[] = [];
    for (const raw of questions.slice(0, unit.count)) {
      try {
        valid.push(this.question(raw, unit, labels));
      } catch (error) {
        invalidCodes.push(
          error instanceof BadRequestException
            ? error.message
            : AiErrorCode.SCHEMA_VALIDATION_FAILED,
        );
      }
    }
    if (questions.length > unit.count) invalidCodes.push(AiErrorCode.COUNT_MISMATCH);
    while (valid.length + invalidCodes.length < unit.count)
      invalidCodes.push(AiErrorCode.COUNT_MISMATCH);
    return { questions: valid, invalidCodes };
  }
  private question(raw: unknown, unit: GenerationUnit, labels: Set<string>): ProviderQuestion {
    const q = raw as Partial<ProviderQuestion>;
    if (
      q.type !== unit.type ||
      q.difficulty !== unit.difficulty ||
      typeof q.questionText !== 'string' ||
      !q.questionText.trim() ||
      typeof q.marks !== 'number' ||
      q.marks !== marksFor(unit.type) ||
      !Array.isArray(q.citations) ||
      !q.citations.length
    )
      throw new BadRequestException(AiErrorCode.SCHEMA_VALIDATION_FAILED);
    if (q.citations.some((label) => typeof label !== 'string' || !labels.has(label)))
      throw new BadRequestException(AiErrorCode.CITATION_VALIDATION_FAILED);
    if (new Set(q.citations).size !== q.citations.length)
      throw new BadRequestException(AiErrorCode.CITATION_VALIDATION_FAILED);
    const options: QuestionOptionDto[] = Array.isArray(q.options)
      ? q.options.map((option, index) => ({
          optionText: option.text,
          optionOrder: index + 1,
          isCorrect: option.isCorrect,
        }))
      : [];
    this.validator.validate(unit.type, options);
    return {
      ...q,
      questionText: q.questionText.trim(),
      type: unit.type,
      difficulty: unit.difficulty,
      marks: q.marks,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : null,
      options: options.map((o) => ({ text: o.optionText, isCorrect: o.isCorrect })),
      citations: q.citations,
    };
  }
}
