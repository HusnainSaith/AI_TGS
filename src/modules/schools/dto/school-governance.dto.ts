import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { UserStatus } from '../../../common/enums/user-status.enum';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class ListSchoolTeachersDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}
export class UpdateTeacherStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}
export class PublishCurriculumDto {
  @IsUUID() @IsOptional() chapterId?: string;
  @IsUUID() @IsOptional() topicId?: string;
}
export class UpdateSchoolBrandingDto {
  @Transform(trim) @IsString() @Length(1, 150) @IsOptional() name?: string;
  @Transform(trim) @IsString() @Length(1, 2000) @IsOptional() address?: string;
  @Transform(trim) @IsString() @Length(3, 30) @IsOptional() phone?: string;
  @Transform(trim) @IsEmail() @IsOptional() email?: string;
  @Transform(trim) @IsString() @Length(3, 150) @IsOptional() website?: string;
  @Transform(trim) @IsString() @Length(1, 1000) @IsOptional() footer?: string;
}
