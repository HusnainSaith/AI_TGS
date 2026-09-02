import { IsBoolean, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class NotificationQueryDto {
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit = 20;
}
export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() productEmailEnabled?: boolean;
}
