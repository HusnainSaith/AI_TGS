import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { User } from '../users/user.entity';
import { DeliveryStatus, NotificationType } from './notification.types';

@Entity('notifications')
@Index(['userId', 'createdAt'])
@Index(['deduplicationKey'], { unique: true })
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type!: NotificationType;
  @Column({ length: 160 }) title!: string;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
  @Column({ name: 'deduplication_key', length: 220 }) deduplicationKey!: string;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
}

@Entity('notification_deliveries')
@Index(['status', 'nextAttemptAt'])
export class NotificationDelivery extends BaseEntity {
  @Column({ name: 'notification_id', type: 'uuid' }) notificationId!: string;
  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;
  @Column({ length: 20, default: 'EMAIL' }) channel!: string;
  @Column({ length: 320 }) recipient!: string;
  @Column({ name: 'encrypted_template_data', type: 'text', nullable: true })
  encryptedTemplateData!: string | null;
  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    enumName: 'notification_delivery_status',
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;
  @Column({ name: 'attempt_count', default: 0 }) attemptCount!: number;
  @Column({ name: 'max_attempts', default: 3 }) maxAttempts!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true })
  processingStartedAt!: Date | null;
  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt!: Date | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
}

@Entity('notification_preferences')
@Index(['userId'], { unique: true })
export class NotificationPreference extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'email_enabled', default: true }) emailEnabled!: boolean;
  @Column({ name: 'product_email_enabled', default: true }) productEmailEnabled!: boolean;
}
