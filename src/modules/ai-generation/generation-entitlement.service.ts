import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
@Injectable()
export class GenerationEntitlementService {
  check(user: AuthenticatedUser, requestedCount: number) {
    void user;
    void requestedCount;
    return { allowed: true, mode: 'NO_SUBSCRIPTION_ENFORCEMENT_YET' as const };
  }
}
