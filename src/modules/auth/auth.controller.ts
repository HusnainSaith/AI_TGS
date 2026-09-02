import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './auth.dto';
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('register') register(
    @Body() dto: RegisterDto,
  ) {
    return this.auth.register(dto);
  }
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @HttpCode(200) @Post('login') login(
    @Body() dto: LoginDto,
  ) {
    return this.auth.login(dto);
  }
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: TokenDto) {
    return this.auth.refresh(dto.token);
  }
  @Public() @HttpCode(204) @Post('logout') logout(@Body() dto: TokenDto) {
    return this.auth.logout(dto.token);
  }
  @ApiBearerAuth() @HttpCode(204) @Post('logout-all') logoutAll(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auth.logoutAll(user.id);
  }
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(204)
  @Post('verify-email')
  verify(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(204)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
  @ApiBearerAuth() @Get('me') me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
