import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SortOrder } from '../../curriculum/dto/curriculum.dto';
import {
  GroundingStatus,
  QuestionDifficulty,
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from '../enums/question.enums';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class QuestionOptionDto {
  @Transform(trim) @IsString() @Length(1, 2000) optionText!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(4) optionOrder!: number;
  @IsBoolean() isCorrect!: boolean;
}
export class CreateQuestionDto {
  @IsUUID() topicId!: string;
  @IsUUID() chapterId!: string;
  @IsUUID() subjectId!: string;
  @IsUUID() classId!: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @Transform(trim) @IsString() @Length(1, 10000) questionText!: string;
  @IsEnum(QuestionDifficulty) difficulty!: QuestionDifficulty;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999.99) marks!: number;
  @Transform(trim) @IsString() @IsOptional() explanation?: string;
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @IsOptional()
  options?: QuestionOptionDto[];
}
export class UpdateQuestionDto {
  @IsUUID() @IsOptional() topicId?: string;
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsEnum(QuestionType) @IsOptional() type?: QuestionType;
  @Transform(trim) @IsString() @Length(1, 10000) @IsOptional() questionText?: string;
  @IsEnum(QuestionDifficulty) @IsOptional() difficulty?: QuestionDifficulty;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  @IsOptional()
  marks?: number;
  @Transform(trim) @IsString() @IsOptional() explanation?: string;
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @IsOptional()
  options?: QuestionOptionDto[];
}
export class ListQuestionsDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
  @Transform(trim) @IsString() @IsOptional() search?: string;
  @IsString() @IsOptional() sortBy?: string;
  @IsEnum(SortOrder) @IsOptional() sortOrder: SortOrder = SortOrder.DESC;
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() topicId?: string;
  @IsEnum(QuestionType) @IsOptional() type?: QuestionType;
  @IsEnum(QuestionDifficulty) @IsOptional() difficulty?: QuestionDifficulty;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999.99)
  @IsOptional()
  marks?: number;
  @IsEnum(QuestionSource) @IsOptional() source?: QuestionSource;
  @IsEnum(QuestionReviewStatus) @IsOptional() reviewStatus?: QuestionReviewStatus;
  @IsEnum(QuestionStatus) @IsOptional() status: QuestionStatus = QuestionStatus.ACTIVE;
}
export interface QuestionResponse {
  id: string;
  topicId: string;
  chapterId: string;
  subjectId: string;
  classId: string;
  type: QuestionType;
  questionText: string;
  difficulty: QuestionDifficulty;
  marks: number;
  explanation: string | null;
  source: QuestionSource;
  reviewStatus: QuestionReviewStatus;
  status: QuestionStatus;
  groundingStatus: GroundingStatus;
  options: Array<{ id: string; optionText: string; optionOrder: number; isCorrect: boolean }>;
  createdAt: Date;
  updatedAt: Date;
}
