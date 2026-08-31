import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from './users.service';
import { ChangePasswordDto } from '../auth/auth.dto';
class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(3, 30) phone?: string;
}
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('me') get(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findById(user.id);
  }
  @Patch('me') update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }
  @Patch('me/password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
