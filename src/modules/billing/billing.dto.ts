import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
export class CheckoutDto {
  @IsUUID() planId!: string;
  @IsOptional() @IsIn(['USER', 'SCHOOL']) ownerType: 'USER' | 'SCHOOL' = 'USER';
  @IsString() @Length(8, 120) idempotencyKey!: string;
}
export class PlanProviderPriceDto {
  @IsUUID() planId!: string;
  @IsString() @Length(1, 40) provider!: string;
  @IsOptional() @IsString() providerProductId?: string;
  @IsString() providerPriceId!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsIn(['MONTHLY', 'YEARLY']) billingInterval!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
