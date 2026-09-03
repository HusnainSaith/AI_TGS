import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { QuestionType } from '../../questions/enums/question.enums';
import { GroundingMode } from '../generation.enums';
export class DifficultyCountsDto {
  @IsInt() @Min(0) easy!: number;
  @IsInt() @Min(0) medium!: number;
  @IsInt() @Min(0) hard!: number;
}
export class QuestionMixDto {
  @IsEnum(QuestionType) type!: QuestionType;
  @IsInt() @Min(0) @Max(100) count!: number;
  @ValidateNested() @Type(() => DifficultyCountsDto) difficulty!: DifficultyCountsDto;
}
export class GenerationUnitDto {
  @IsUUID() chapterId!: string;
  @ValidateIf((value: GenerationUnitDto) => !value.allTopics)
  @IsUUID()
  topicId?: string;
  @IsBoolean() @IsOptional() allTopics?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => QuestionMixDto)
  questionMix!: QuestionMixDto[];
}
export class KnowledgeBaseGenerationDto {
  @IsEnum(GroundingMode) mode: GroundingMode = GroundingMode.REQUIRED;
  @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) @IsOptional() documentIds?: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(50) @IsOptional() topK?: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) @IsOptional() minSimilarity?: number;
}
export class CreateGenerationDto {
  @IsUUID() classId!: string;
  @IsUUID() @IsOptional() sectionId?: string;
  @IsUUID() subjectId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GenerationUnitDto)
  units!: GenerationUnitDto[];
  @IsString() @Length(2, 20) language!: string;
  @IsObject()
  @ValidateNested()
  @Type(() => KnowledgeBaseGenerationDto)
  knowledgeBase: KnowledgeBaseGenerationDto = new KnowledgeBaseGenerationDto();
  @IsInt() @Min(0) @Max(100) @IsOptional() avoidRepeatsFromLastNTests?: number;
  @IsInt() @Min(1) @Max(1440) @IsOptional() targetDurationMinutes?: number;
  @Type(() => Number) @IsNumber() @Min(0.25) @Max(10000) @IsOptional() targetMarks?: number;
}
