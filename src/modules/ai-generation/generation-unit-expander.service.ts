import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionDifficulty } from '../questions/enums/question.enums';
import { CreateGenerationDto } from './dto/generation.dto';
import { GenerationUnit } from './generation.contracts';
@Injectable()
export class GenerationUnitExpander {
  constructor(private readonly config: ConfigService) {}
  expand(dto: CreateGenerationDto): GenerationUnit[] {
    const result: GenerationUnit[] = [];
    const seen = new Set<string>();
    for (const unit of dto.units)
      for (const mix of unit.questionMix) {
        const total = mix.difficulty.easy + mix.difficulty.medium + mix.difficulty.hard;
        if (total !== mix.count)
          throw new BadRequestException(`Difficulty counts must equal ${mix.type} count`);
        const key = `${unit.topicId}:${mix.type}`;
        if (seen.has(key))
          throw new BadRequestException('Each Topic and question type may appear only once');
        seen.add(key);
        for (const [difficulty, count] of [
          [QuestionDifficulty.EASY, mix.difficulty.easy],
          [QuestionDifficulty.MEDIUM, mix.difficulty.medium],
          [QuestionDifficulty.HARD, mix.difficulty.hard],
        ] as const)
          if (count > 0)
            result.push({
              topicId: unit.topicId,
              chapterId: unit.chapterId,
              type: mix.type,
              difficulty,
              count,
            });
      }
    const total = result.reduce((sum, unit) => sum + unit.count, 0);
    if (!total) throw new BadRequestException('At least one question must be requested');
    if (total > this.config.getOrThrow<number>('aiGeneration.maxQuestionsPerRequest'))
      throw new BadRequestException('Requested question count exceeds the configured maximum');
    return result.sort(
      (a, b) =>
        a.topicId.localeCompare(b.topicId) ||
        a.type.localeCompare(b.type) ||
        a.difficulty.localeCompare(b.difficulty),
    );
  }
}
