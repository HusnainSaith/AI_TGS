import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { User } from '../users/user.entity';
export enum AuthTokenType {
  REFRESH = 'REFRESH',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}
@Entity('auth_tokens')
@Index(['userId', 'type'])
export class AuthToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Index({ unique: true }) @Column({ name: 'token_hash', length: 64 }) tokenHash!: string;
  @Column({ type: 'enum', enum: AuthTokenType, enumName: 'auth_token_type' }) type!: AuthTokenType;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true }) consumedAt!: Date | null;
  @Column({ name: 'family_id', type: 'uuid', nullable: true }) familyId!: string | null;
}
