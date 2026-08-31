import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingInterval, SubscriptionStatus } from '../subscription.enums';
export class PlanLimitsDto {
  @ApiProperty({ nullable: true }) @IsOptional() @IsNumber() @Min(0) aiQuestionsPerPeriod!:
    number | null;
  @IsOptional() @IsNumber() @Min(0) testsPerPeriod?: number | null;
  @IsOptional() @IsNumber() @Min(0) pdfExportsPerPeriod?: number | null;
  @IsOptional() @IsNumber() @Min(0) storageBytes?: number | null;
}
export class CreatePlanDto {
  @IsString() @Length(1, 60) name!: string;
  @Matches(/^[A-Z0-9_]+$/) code!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price!: number;
  @IsString() @Length(3, 3) currency!: string;
  @IsEnum(BillingInterval) billingInterval!: BillingInterval;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @ValidateNested() @Type(() => PlanLimitsDto) limits!: PlanLimitsDto;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
}
export class UpdatePlanDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @ValidateNested() @Type(() => PlanLimitsDto) limits?: PlanLimitsDto;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
}
export class CreateSubscriptionDto {
  @IsUUID() planId!: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() schoolId?: string;
  @IsEnum(SubscriptionStatus) status!: SubscriptionStatus;
  @IsISO8601() currentPeriodStart!: string;
  @IsISO8601() currentPeriodEnd!: string;
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class UpdateSubscriptionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
  @IsOptional() @IsISO8601() currentPeriodStart?: string;
  @IsOptional() @IsISO8601() currentPeriodEnd?: string;
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
