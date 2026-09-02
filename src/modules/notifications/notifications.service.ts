import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER, EmailProvider } from '../../infrastructure/providers/provider.contracts';
import { Inject } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/user.entity';
import {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from './notification.entities';
import { DeliveryStatus, MANDATORY_EMAIL_TYPES, NotificationType } from './notification.types';
import { renderEmail } from './email-templates';
import { UpdatePreferencesDto } from './notification.dto';
import { EmailProviderError } from './nodemailer-email.provider';
import { decryptEmailTemplateData, encryptEmailTemplateData } from './email-token-crypto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private notifications: Repository<Notification>,
    @InjectRepository(NotificationDelivery) private deliveries: Repository<NotificationDelivery>,
    @InjectRepository(NotificationPreference)
    private preferences: Repository<NotificationPreference>,
    @InjectRepository(User) private users: Repository<User>,
    private data: DataSource,
    @Inject(EMAIL_PROVIDER) private email: EmailProvider,
    private audit: AuditService,
    private config: ConfigService,
  ) {}
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    deduplicationKey: string;
    metadata?: Record<string, unknown>;
    secureEmailMetadata?: Record<string, unknown>;
    email?: boolean;
  }) {
    const existing = await this.notifications.findOneBy({
      deduplicationKey: input.deduplicationKey,
    });
    if (existing) return existing;
    const user = await this.users.findOneBy({ id: input.userId });
    if (!user) throw new NotFoundException('Notification user not found');
    const preference = await this.preferences.findOneBy({ userId: input.userId });
    const emailAllowed =
      MANDATORY_EMAIL_TYPES.has(input.type) ||
      (input.email !== false &&
        (preference?.emailEnabled ?? true) &&
        (preference?.productEmailEnabled ?? true));
    try {
      return await this.data.transaction(async (m) => {
        const notification = await m.save(
          Notification,
          m.create(Notification, {
            userId: input.userId,
            type: input.type,
            title: input.title,
            message: input.message,
            deduplicationKey: input.deduplicationKey,
            metadata: input.metadata ?? {},
            readAt: null,
          }),
        );
        if (emailAllowed)
          await m.save(
            NotificationDelivery,
            m.create(NotificationDelivery, {
              notificationId: notification.id,
              channel: 'EMAIL',
              recipient: user.email,
              encryptedTemplateData: input.secureEmailMetadata
                ? this.encrypt(input.secureEmailMetadata, `${input.type}:${input.userId}`)
                : null,
              status: DeliveryStatus.PENDING,
              attemptCount: 0,
              maxAttempts: 3,
              nextAttemptAt: new Date(),
              processingToken: null,
              processingStartedAt: null,
              lastAttemptAt: null,
              sentAt: null,
              failedAt: null,
              errorCode: null,
            }),
          );
        return notification;
      });
    } catch (error) {
      if (String(error).includes('duplicate'))
        return this.notifications.findOneByOrFail({ deduplicationKey: input.deduplicationKey });
      throw error;
    }
  }
  async list(userId: string, page: number, limit: number) {
    const [items, total] = await this.notifications.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }
  async unreadCount(userId: string) {
    return { count: await this.notifications.count({ where: { userId, readAt: IsNull() } }) };
  }
  async read(userId: string, id: string) {
    const result = await this.notifications.update({ id, userId }, { readAt: new Date() });
    if (!result.affected) throw new NotFoundException();
    return { read: true };
  }
  async readAll(userId: string) {
    await this.notifications
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('user_id=:userId AND read_at IS NULL', { userId })
      .execute();
    return { read: true };
  }
  async getPreferences(userId: string) {
    return (
      (await this.preferences.findOneBy({ userId })) ?? {
        userId,
        emailEnabled: true,
        productEmailEnabled: true,
      }
    );
  }
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    let row = await this.preferences.findOneBy({ userId });
    row = this.preferences.create({ ...(row ?? { userId }), ...dto });
    const saved = await this.preferences.save(row);
    await this.audit.record({
      actorId: userId,
      action: 'notification.preferences.update',
      entityType: 'notification_preference',
      entityId: saved.id,
    });
    return saved;
  }
  async process(batch = 20) {
    const claims: Array<{ id: string; token: string }> = await this.data.transaction(async (m) => {
      const rows: Array<{ id: string }> = await m.query(
        `SELECT id FROM notification_deliveries WHERE ((status='PENDING' AND next_attempt_at<=now()) OR (status='PROCESSING' AND processing_started_at<now()-interval '10 minutes')) AND attempt_count<max_attempts ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1`,
        [batch],
      );
      const claimed: Array<{ id: string; token: string }> = [];
      for (const row of rows) {
        const token = randomUUID();
        await m.update(NotificationDelivery, row.id, {
          status: DeliveryStatus.PROCESSING,
          processingToken: token,
          processingStartedAt: new Date(),
        });
        claimed.push({ id: row.id, token });
      }
      return claimed;
    });
    for (const claim of claims) await this.deliver(claim.id, claim.token);
    return { claimed: claims.length };
  }
  private async deliver(id: string, processingToken: string) {
    const delivery = await this.deliveries.findOne({
      where: { id, processingToken, status: DeliveryStatus.PROCESSING },
      relations: { notification: true },
    });
    if (!delivery || delivery.status !== DeliveryStatus.PROCESSING) return;
    delivery.attemptCount++;
    delivery.lastAttemptAt = new Date();
    try {
      await this.email.send(
        renderEmail(
          delivery.notification.type,
          delivery.notification.title,
          delivery.notification.message,
          {
            ...delivery.notification.metadata,
            ...this.decrypt(
              delivery.encryptedTemplateData,
              `${delivery.notification.type}:${delivery.notification.userId}`,
            ),
          },
          delivery.recipient,
        ),
      );
      delivery.status = DeliveryStatus.SENT;
      delivery.sentAt = new Date();
      delivery.errorCode = null;
    } catch (error) {
      const code = error instanceof EmailProviderError ? error.code : 'EMAIL_TEMPORARY_FAILURE';
      delivery.errorCode = code;
      const retryable = code === 'EMAIL_TEMPORARY_FAILURE' || code === 'EMAIL_NOT_CONFIGURED';
      if (retryable && delivery.attemptCount < delivery.maxAttempts) {
        delivery.status = DeliveryStatus.PENDING;
        delivery.nextAttemptAt = new Date(Date.now() + 60_000 * 2 ** (delivery.attemptCount - 1));
      } else {
        delivery.status = DeliveryStatus.FAILED;
        delivery.failedAt = new Date();
      }
    }
    delivery.processingToken = null;
    delivery.processingStartedAt = null;
    const updated = await this.deliveries.update(
      { id: delivery.id, processingToken },
      {
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        nextAttemptAt: delivery.nextAttemptAt,
        processingToken: null,
        processingStartedAt: null,
        lastAttemptAt: delivery.lastAttemptAt,
        sentAt: delivery.sentAt,
        failedAt: delivery.failedAt,
        errorCode: delivery.errorCode,
      },
    );
    if (!updated.affected) return;
    await this.audit.record({
      action:
        delivery.status === DeliveryStatus.SENT
          ? 'notification.delivery.sent'
          : delivery.status === DeliveryStatus.FAILED
            ? 'notification.delivery.failed'
            : 'notification.delivery.retry_scheduled',
      entityType: 'notification_delivery',
      entityId: delivery.id,
      metadata: {
        notificationType: delivery.notification.type,
        attemptCount: delivery.attemptCount,
        errorCode: delivery.errorCode,
      },
      outcome: delivery.status === DeliveryStatus.FAILED ? 'FAILED' : 'SUCCEEDED',
    });
  }
  async retry(id: string, actorId: string) {
    const row = await this.deliveries.findOneBy({ id });
    if (!row) throw new NotFoundException();
    if (row.status !== DeliveryStatus.FAILED)
      throw new ConflictException('Delivery is not retryable');
    row.status = DeliveryStatus.PENDING;
    row.attemptCount = 0;
    row.nextAttemptAt = new Date();
    row.failedAt = null;
    row.errorCode = null;
    await this.deliveries.save(row);
    await this.audit.record({
      actorId,
      action: 'notification.delivery.retry',
      entityType: 'notification_delivery',
      entityId: id,
    });
    return row;
  }
  verifySmtp() {
    return this.email.verify();
  }
  private encryptionKey() {
    const configured = this.config.get<string>('email.tokenEncryptionKey');
    if (configured) return Buffer.from(configured, 'base64');
    return createHash('sha256')
      .update(`notification-email-v1:${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}`)
      .digest();
  }
  private encrypt(value: Record<string, unknown>, binding: string) {
    return encryptEmailTemplateData(value, this.encryptionKey(), binding);
  }
  private decrypt(value: string | null, binding: string) {
    if (!value) return {};
    return decryptEmailTemplateData(value, this.encryptionKey(), binding);
  }
}
