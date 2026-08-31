import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UserRole } from '../src/common/enums/user-role.enum';
describe('RolesGuard', () => {
  it('denies a teacher from a system-admin route', () => {
    const reflector = { getAllAndOverride: () => [UserRole.SYSTEM_ADMIN] } as unknown as Reflector;
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.TEACHER } }) }),
    } as unknown as ExecutionContext;
    expect(new RolesGuard(reflector).canActivate(context)).toBe(false);
  });
  it('denies a school administrator from a system-admin route', () => {
    const reflector = { getAllAndOverride: () => [UserRole.SYSTEM_ADMIN] } as unknown as Reflector;
    const context = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: UserRole.SCHOOL_ADMIN } }) }),
    } as unknown as ExecutionContext;
    expect(new RolesGuard(reflector).canActivate(context)).toBe(false);
  });
});
