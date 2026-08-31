import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  TenantScope,
} from '../enums/knowledge-base.enums';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class RightsMetadataDto {
  @Type(() => Boolean) @IsBoolean() permissionConfirmed!: boolean;
  @Transform(trim) @IsString() @Length(1, 150) sourceOwner!: string;
  @Transform(trim) @IsString() @Length(1, 80) @IsOptional() rightsType?: string;
  @Transform(trim) @IsString() @Length(1, 150) @IsOptional() licence?: string;
  @Transform(trim) @IsString() @Length(1, 1000) @IsOptional() notes?: string;
}
export class CreateKnowledgeDocumentDto {
  @Transform(trim) @IsString() @Length(1, 250) title!: string;
  @IsEnum(TenantScope) tenantScope!: TenantScope;
  @IsEnum(KnowledgeSourceType) sourceType!: KnowledgeSourceType;
  @Transform(trim) @IsString() @Length(2, 20) language = 'en';
  @IsObject() @ValidateNested() @Type(() => RightsMetadataDto) rights!: RightsMetadataDto;
}
export class UpdateKnowledgeDocumentDto {
  @Transform(trim) @IsString() @Length(1, 250) @IsOptional() title?: string;
  @Transform(trim) @IsString() @Length(2, 20) @IsOptional() language?: string;
  @IsObject()
  @ValidateNested()
  @Type(() => RightsMetadataDto)
  @IsOptional()
  rights?: RightsMetadataDto;
}
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}
export class ListKnowledgeDocumentsDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
  @Transform(trim) @IsString() @IsOptional() search?: string;
  @IsEnum(TenantScope) @IsOptional() tenantScope?: TenantScope;
  @IsEnum(KnowledgeDocumentStatus) @IsOptional() status: KnowledgeDocumentStatus =
    KnowledgeDocumentStatus.DRAFT;
  @IsEnum(KnowledgeSourceType) @IsOptional() sourceType?: KnowledgeSourceType;
  @Transform(trim) @IsString() @Length(2, 20) @IsOptional() language?: string;
  @IsString() @IsOptional() sortBy?: string;
  @IsEnum(SortOrder) @IsOptional() sortOrder: SortOrder = SortOrder.DESC;
}
export class ListVersionsDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}
