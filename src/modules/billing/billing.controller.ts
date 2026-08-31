import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { BillingService } from './billing.service';
import { CheckoutDto, PlanProviderPriceDto } from './billing.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private service: BillingService) {}
  @Post('checkout') @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN) checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.checkout(dto, user);
  }
  @Get('transactions') @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN) transactions(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listTransactions(user);
  }
  @Public()
  @Post('webhooks/:provider')
  @ApiHeader({ name: 'x-billing-signature', required: true })
  @ApiOperation({ summary: 'Provider-signed webhook (no JWT)' })
  webhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-billing-signature') signature = '',
  ) {
    return this.service.webhook(provider, req.rawBody ?? Buffer.alloc(0), signature);
  }
}

@ApiTags('Admin Billing')
@ApiBearerAuth()
@Controller('admin/billing')
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminBillingController {
  constructor(private service: BillingService) {}
  @Get('events') events() {
    return this.service.listEvents();
  }
  @Post('events/:id/retry') retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.retry(id);
  }
  @Post('reconcile') reconcile() {
    return this.service.reconcile();
  }
  @Get('plan-prices') mappings() {
    return this.service.listMappings();
  }
  @Post('plan-prices') createMapping(@Body() dto: PlanProviderPriceDto) {
    return this.service.createMapping(dto);
  }
}
