import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
export interface TenantContext {
  schoolId: string | null;
  isGlobal: boolean;
  actorId: string;
}
export function tenantContextFrom(user: AuthenticatedUser): TenantContext {
  if (user.role === UserRole.SYSTEM_ADMIN)
    return { schoolId: null, isGlobal: true, actorId: user.id };
  if (!user.schoolId) throw new ForbiddenException('A school context is required');
  return { schoolId: user.schoolId, isGlobal: false, actorId: user.id };
}
