import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerifiedEmailGuard } from '../src/common/guards/verified-email.guard';
describe('VerifiedEmailGuard', () => {
  const context = (verified: boolean) =>
    ({
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: { emailVerified: verified } }) }),
    }) as unknown as ExecutionContext;
  it('rejects an unverified user on protected business routes', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    expect(() => new VerifiedEmailGuard(reflector).canActivate(context(false))).toThrow(
      ForbiddenException,
    );
  });
  it('allows a verified user', () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    expect(new VerifiedEmailGuard(reflector).canActivate(context(true))).toBe(true);
  });
});
