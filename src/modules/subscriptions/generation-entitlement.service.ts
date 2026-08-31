/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EntitlementService } from './entitlement.service';
import { UsageService } from './usage.service';
@Injectable()
export class GenerationEntitlementService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
  ) {}
  async reserve(user: AuthenticatedUser, jobId: string, requested: number, manager: EntityManager) {
    const entitlement = await this.entitlements.resolve(user, undefined, manager);
    return this.usage.reserve(entitlement, requested, 'GENERATION_JOB', jobId, user.id, manager);
  }
  async reserveRegeneration(
    user: AuthenticatedUser,
    itemId: string,
    attempt: number,
    amount: number,
  ) {
    const entitlement = await this.entitlements.resolve(user);
    return this.usage.reserve(entitlement, amount, `GENERATION_REGEN_${attempt}`, itemId, user.id);
  }
  settle(jobId: string, actorId?: string) {
    return this.usage.settleGeneration(jobId, actorId);
  }
  settleRegeneration(itemId: string, attempt: number, actorId?: string) {
    return this.usage.settleRegeneration(itemId, attempt, actorId);
  }
}
