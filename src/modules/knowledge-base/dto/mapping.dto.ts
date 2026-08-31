import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { MappingStatus } from '../enums/knowledge-base.enums';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class CreateMappingDto {
  @IsUUID() boardId!: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() topicId?: string;
}
export class ListMappingsDto {
  @IsUUID() @IsOptional() boardId?: string;
  @IsUUID() @IsOptional() classId?: string;
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() topicId?: string;
  @IsEnum(MappingStatus) @IsOptional() status?: MappingStatus;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}
export class CoverageQueryDto extends CreateMappingDto {}
export class RejectMappingDto {
  @Transform(trim) @IsString() @Length(1, 500) @IsOptional() reason?: string;
}
