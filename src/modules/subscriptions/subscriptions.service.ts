/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import {
  CreatePlanDto,
  CreateSubscriptionDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { Plan } from './entities/plan.entity';
import { Subscription } from './entities/subscription.entity';
import { EntitlementService } from './entitlement.service';
@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Plan) private plans: Repository<Plan>,
    @InjectRepository(Subscription) private subscriptions: Repository<Subscription>,
    private data: DataSource,
    private entitlement: EntitlementService,
    private audit: AuditService,
  ) {}
  listPlans() {
    return this.plans.find({ order: { createdAt: 'DESC' } });
  }
  async createPlan(dto: CreatePlanDto, user: AuthenticatedUser) {
    const saved = await this.plans.save(
      this.plans.create({
        ...dto,
        price: dto.price.toFixed(2),
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        features: dto.features ?? {},
      }),
    );
    await this.audit.record({
      actorId: user.id,
      action: 'subscription.plan.create',
      entityType: 'plan',
      entityId: saved.id,
    });
    return saved;
  }
  async updatePlan(id: string, dto: UpdatePlanDto, user: AuthenticatedUser) {
    const p = await this.plans.findOneBy({ id });
    if (!p) throw new NotFoundException('Plan not found');
    Object.assign(p, dto);
    const saved = await this.plans.save(p);
    await this.audit.record({
      actorId: user.id,
      action: 'subscription.plan.update',
      entityType: 'plan',
      entityId: id,
    });
    return saved;
  }
  async createSubscription(dto: CreateSubscriptionDto, user: AuthenticatedUser) {
    if (Boolean(dto.userId) === Boolean(dto.schoolId))
      throw new BadRequestException('Exactly one subscription owner is required');
    if (new Date(dto.currentPeriodStart) >= new Date(dto.currentPeriodEnd))
      throw new BadRequestException('currentPeriodEnd must be after currentPeriodStart');
    const plan = await this.plans.findOneBy({ id: dto.planId });
    if (!plan) throw new NotFoundException('Plan not found');
    const saved = await this.subscriptions.save(
      this.subscriptions.create({
        ...dto,
        currentPeriodStart: new Date(dto.currentPeriodStart),
        currentPeriodEnd: new Date(dto.currentPeriodEnd),
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd ?? false,
        cancelledAt: null,
        provider: null,
        providerCustomerId: null,
        providerSubscriptionId: null,
        metadata: dto.metadata ?? null,
      }),
    );
    await this.audit.record({
      actorId: user.id,
      action: 'subscription.create',
      entityType: 'subscription',
      entityId: saved.id,
      metadata: {
        userId: saved.userId,
        schoolId: saved.schoolId,
        planId: saved.planId,
        status: saved.status,
      },
    });
    return saved;
  }
  async updateSubscription(id: string, dto: UpdateSubscriptionDto, user: AuthenticatedUser) {
    const s = await this.subscriptions.findOneBy({ id });
    if (!s) throw new NotFoundException('Subscription not found');
    if (dto.currentPeriodStart) s.currentPeriodStart = new Date(dto.currentPeriodStart);
    if (dto.currentPeriodEnd) s.currentPeriodEnd = new Date(dto.currentPeriodEnd);
    Object.assign(s, {
      ...dto,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
    });
    if (s.currentPeriodStart >= s.currentPeriodEnd)
      throw new BadRequestException('Invalid billing period');
    const saved = await this.subscriptions.save(s);
    await this.audit.record({
      actorId: user.id,
      action: 'subscription.update',
      entityType: 'subscription',
      entityId: id,
      metadata: { planId: s.planId, status: s.status },
    });
    return saved;
  }
  async mine(user: AuthenticatedUser) {
    const ent = await this.entitlement.resolve(user);
    const [row] = await this.data.query(
      `SELECT s.id,s.status,s.current_period_start "periodStart",s.current_period_end "periodEnd",p.id "planId",p.name "planName",p.code "planCode",p.limits,COALESCE(c.used,0)::int used,COALESCE(c.reserved,0)::int reserved FROM subscriptions s JOIN plans p ON p.id=s.plan_id LEFT JOIN usage_counters c ON c.subscription_id=s.id AND c.metric='AI_QUESTIONS' AND c.period_start=s.current_period_start AND c.period_end=s.current_period_end WHERE s.id=$1`,
      [ent.subscriptionId],
    );
    return { ...row, remaining: ent.limit === null ? null : ent.limit - row.used - row.reserved };
  }
  usage(user: AuthenticatedUser) {
    return this.mine(user);
  }
  async assertOwner(id: string, user: AuthenticatedUser) {
    const s = await this.subscriptions.findOneBy({ id });
    if (!s) throw new NotFoundException();
    if (user.role !== UserRole.SYSTEM_ADMIN && s.userId !== user.id && s.schoolId !== user.schoolId)
      throw new ForbiddenException();
    return s;
  }
}
