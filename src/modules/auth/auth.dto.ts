import { IsEmail, IsString, Length, MinLength } from 'class-validator';
export class RegisterDto {
  @IsString() @Length(2, 120) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
}
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
export class TokenDto {
  @IsString() token!: string;
}
export class ForgotPasswordDto {
  @IsEmail() email!: string;
}
export class ResetPasswordDto extends TokenDto {
  @IsString() @MinLength(12) password!: string;
}
export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(12) newPassword!: string;
}
