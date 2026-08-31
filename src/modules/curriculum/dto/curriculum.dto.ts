import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { CurriculumStatus } from '../curriculum-status.enum';
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class PaginationQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
  @Transform(trim) @IsString() @IsOptional() search?: string;
  @IsString() @IsOptional() sortBy?: string;
  @IsEnum(SortOrder) @IsOptional() sortOrder = SortOrder.ASC;
  @IsEnum(CurriculumStatus) @IsOptional() status = CurriculumStatus.ACTIVE;
}
export class CreateBoardDto {
  @Transform(trim) @IsString() @Length(1, 120) name!: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class UpdateBoardDto {
  @Transform(trim) @IsString() @Length(1, 120) @IsOptional() name?: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class CreateClassDto {
  @IsUUID() boardId!: string;
  @Transform(trim) @IsString() @Length(1, 60) name!: string;
}
export class UpdateClassDto {
  @IsUUID() @IsOptional() boardId?: string;
  @Transform(trim) @IsString() @Length(1, 60) @IsOptional() name?: string;
}
export class CreateSectionDto {
  @IsUUID() classId!: string;
  @Transform(trim) @IsString() @Length(1, 30) name!: string;
}
export class UpdateSectionDto {
  @IsUUID() @IsOptional() classId?: string;
  @Transform(trim) @IsString() @Length(1, 30) @IsOptional() name?: string;
}
export class CreateSubjectDto {
  @IsUUID() classId!: string;
  @IsUUID() boardId!: string;
  @Transform(trim) @IsString() @Length(1, 80) name!: string;
  @Transform(trim) @IsString() @Length(2, 20) @IsOptional() language = 'en';
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class UpdateSubjectDto {
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() boardId?: string;
  @Transform(trim) @IsString() @Length(1, 80) @IsOptional() name?: string;
  @Transform(trim) @IsString() @Length(2, 20) @IsOptional() language?: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class CreateChapterDto {
  @IsUUID() subjectId!: string;
  @Type(() => Number) @IsInt() @Min(1) chapterNumber!: number;
  @Transform(trim) @IsString() @Length(1, 120) name!: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class UpdateChapterDto {
  @IsUUID() @IsOptional() subjectId?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() chapterNumber?: number;
  @Transform(trim) @IsString() @Length(1, 120) @IsOptional() name?: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
}
export class CreateTopicDto {
  @IsUUID() chapterId!: string;
  @Transform(trim) @IsString() @Length(1, 150) name!: string;
  @Transform(trim) @IsString() @IsOptional() description?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() order = 0;
}
export class UpdateTopicDto {
  @IsUUID() @IsOptional() chapterId?: string;
  @Transform(trim) @IsString() @Length(1, 150) @IsOptional() name?: string;
  @Transform(trim) @IsString() @Length(1, 150) @IsOptional() description?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() order?: number;
}
export class ClassesQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() boardId?: string;
}
export class SectionsQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() classId?: string;
}
export class SubjectsQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() boardId?: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsString() @IsOptional() language?: string;
}
export class ChaptersQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() subjectId?: string;
}
export class TopicsQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() boardId?: string;
}
