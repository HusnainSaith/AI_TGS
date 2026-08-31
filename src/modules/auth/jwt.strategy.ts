import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../common/enums/user-status.enum';
import { UsersService } from '../users/users.service';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }
  async validate(payload: { sub: string }) {
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      emailVerified: user.emailVerified,
    };
  }
}
