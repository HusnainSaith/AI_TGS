import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TestStatus } from '../test.enums';
export class CreateTestDto {
  @IsString() @Length(1, 160) title!: string;
  @IsUUID() classId!: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsUUID() subjectId!: string;
  @IsString() @Length(2, 20) language!: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsString() @Length(0, 5000) instructions?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
}
export class UpdateTestDto {
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() @Length(0, 5000) instructions?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsString() @Length(2, 20) language?: string;
  @IsOptional() @IsUUID() sectionId?: string;
}
export class AddQuestionDto {
  @IsUUID() questionId!: string;
  @IsOptional() @IsInt() @Min(1) position?: number;
  @IsOptional() @Min(0.25) @Max(100) marks?: number;
}
export class BulkAddQuestionsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) questionIds!: string[];
}
export class OrderItemDto {
  @IsUUID() testQuestionId!: string;
  @IsInt() @Min(1) position!: number;
}
export class ReorderQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
export class ListTestsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsEnum(TestStatus) status?: TestStatus;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsString() @Length(1, 100) search?: string;
}
