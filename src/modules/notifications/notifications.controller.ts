import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { NotificationQueryDto, UpdatePreferencesDto } from './notification.dto';
import { NotificationsService } from './notifications.service';
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthenticatedUser, @Query() q: NotificationQueryDto) {
    return this.service.list(u.id, q.page, q.limit);
  }
  @Get('unread-count') unread(@CurrentUser() u: AuthenticatedUser) {
    return this.service.unreadCount(u.id);
  }
  @Patch(':id/read') read(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.read(u.id, id);
  }
  @Post('read-all') readAll(@CurrentUser() u: AuthenticatedUser) {
    return this.service.readAll(u.id);
  }
  @Get('preferences') preferences(@CurrentUser() u: AuthenticatedUser) {
    return this.service.getPreferences(u.id);
  }
  @Patch('preferences') update(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpdatePreferencesDto,
  ) {
    return this.service.updatePreferences(u.id, d);
  }
}
@ApiTags('Admin Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminNotificationsController {
  constructor(private service: NotificationsService) {}
  @Post('process') process() {
    return this.service.process();
  }
  @Post('deliveries/:id/retry') retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.retry(id, u.id);
  }
  @Post('smtp/verify') verify() {
    return this.service.verifySmtp();
  }
}
