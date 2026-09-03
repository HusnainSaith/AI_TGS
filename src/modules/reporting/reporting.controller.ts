import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ReportingService } from './reporting.service';

@ApiTags('Usage Reports')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN)
@Controller('reports')
export class ReportingController {
  constructor(private reports: ReportingService) {}
  @Get('usage')
  @ApiOperation({
    summary: 'Get tenant-scoped current-cycle plan usage and persisted storage bytes',
  })
  usage(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.currentCycle(user);
  }
}
