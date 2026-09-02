import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
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
                ? this.encrypt(input.secureEmailMetadata)
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
    const ids: string[] = await this.data.transaction(async (m) => {
      const rows: Array<{ id: string }> = await m.query(
        `SELECT id FROM notification_deliveries WHERE ((status='PENDING' AND next_attempt_at<=now()) OR (status='PROCESSING' AND processing_started_at<now()-interval '10 minutes')) AND attempt_count<max_attempts ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1`,
        [batch],
      );
      for (const row of rows)
        await m.update(NotificationDelivery, row.id, {
          status: DeliveryStatus.PROCESSING,
          processingToken: randomUUID(),
          processingStartedAt: new Date(),
        });
      return rows.map((r) => r.id);
    });
    for (const id of ids) await this.deliver(id);
    return { claimed: ids.length };
  }
  private async deliver(id: string) {
    const delivery = await this.deliveries.findOne({
      where: { id },
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
            ...this.decrypt(delivery.encryptedTemplateData),
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
    await this.deliveries.save(delivery);
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
    if (row.status !== DeliveryStatus.FAILED || row.attemptCount >= row.maxAttempts)
      throw new ConflictException('Delivery is not retryable');
    row.status = DeliveryStatus.PENDING;
    row.nextAttemptAt = new Date();
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
    return createHash('sha256')
      .update(this.config.getOrThrow<string>('JWT_ACCESS_SECRET'))
      .digest();
  }
  private encrypt(value: Record<string, unknown>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }
  private decrypt(value: string | null) {
    if (!value) return {};
    const [iv, tag, encrypted] = value.split('.');
    if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted template data');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    ) as Record<string, unknown>;
  }
}
