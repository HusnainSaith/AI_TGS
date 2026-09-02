import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_PROVIDER } from '../../infrastructure/providers/provider.contracts';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from './notification.entities';
import { AdminNotificationsController, NotificationsController } from './notifications.controller';
import { NodemailerEmailProvider } from './nodemailer-email.provider';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationDelivery, NotificationPreference, User]),
    AuditModule,
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new NodemailerEmailProvider(config),
    },
    NotificationsService,
    NotificationsWorker,
  ],
  exports: [NotificationsService, EMAIL_PROVIDER],
})
export class NotificationsModule {}
