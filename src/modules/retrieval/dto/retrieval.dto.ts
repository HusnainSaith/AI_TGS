import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class RetrievalPreviewDto {
  @Transform(trim) @IsString() @Length(1, 2000) queryText!: string;
  @IsUUID() boardId!: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() topicId?: string;
  @Transform(trim) @IsString() @Length(2, 20) @IsOptional() language?: string;
  @IsArray() @ArrayMaxSize(50) @IsUUID('4', { each: true }) @IsOptional() documentIds?: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(50) @IsOptional() topK?: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) @IsOptional() minSimilarity?: number;
  @Type(() => Number) @IsInt() @Min(100) @Max(50000) @IsOptional() contextBudgetTokens?: number;
}
