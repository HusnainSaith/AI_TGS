import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VERIFIED_EMAIL_KEY } from '../decorators/verified-email.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(VERIFIED_EMAIL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.emailVerified) throw new ForbiddenException('Email verification is required');
    return true;
  }
}
