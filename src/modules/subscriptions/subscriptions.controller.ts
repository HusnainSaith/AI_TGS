import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreatePlanDto,
  CreateSubscriptionDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';
@ApiTags('Admin Subscriptions')
@ApiBearerAuth()
@Controller('admin')
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminSubscriptionsController {
  constructor(
    private service: SubscriptionsService,
    private usage: UsageService,
  ) {}
  @Get('plans') list() {
    return this.service.listPlans();
  }
  @Post('plans') create(@Body() d: CreatePlanDto, @CurrentUser() u: AuthenticatedUser) {
    return this.service.createPlan(d, u);
  }
  @Patch('plans/:id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdatePlanDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.updatePlan(id, d, u);
  }
  @Post('subscriptions') subscription(
    @Body() d: CreateSubscriptionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.createSubscription(d, u);
  }
  @Patch('subscriptions/:id') updateSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateSubscriptionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.updateSubscription(id, d, u);
  }
  @Post('usage/expire')
  @ApiOperation({ summary: 'Release stale PostgreSQL usage reservations' })
  expire(@CurrentUser() u: AuthenticatedUser) {
    return this.usage.expire(u.id);
  }
}
@ApiTags('Subscription')
@ApiBearerAuth()
@Controller('subscription')
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN)
export class SubscriptionController {
  constructor(private service: SubscriptionsService) {}
  @Get() mine(@CurrentUser() u: AuthenticatedUser) {
    return this.service.mine(u);
  }
  @Get('usage') usage(@CurrentUser() u: AuthenticatedUser) {
    return this.service.usage(u);
  }
}
