import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { hash, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { AuthToken, AuthTokenType } from './auth-token.entity';
import { LoginDto, RegisterDto } from './auth.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.types';
type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  emailVerified: boolean;
};
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$92sKQndROh3TZ+4RVLzf+w$a42+0bOI0jPNe/hHhap3fr4LK7mg4dFmbuahzmVBNhI';
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(AuthToken) private readonly tokens: Repository<AuthToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
  ) {}
  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private safe(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    schoolId: string | null;
    emailVerified: boolean;
  }): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      emailVerified: user.emailVerified,
    };
  }
  async register(dto: RegisterDto) {
    if (await this.users.findByEmailWithPassword(dto.email))
      throw new ConflictException('Email is already registered');
    const user = await this.users.create({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      passwordHash: await hash(dto.password),
      role: UserRole.TEACHER,
      schoolId: null,
    });
    const verificationToken = await this.issueOpaque(
      user.id,
      AuthTokenType.EMAIL_VERIFICATION,
      24 * 60 * 60 * 1000,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
    });
    await this.notifications?.create({
      userId: user.id,
      type: NotificationType.EMAIL_VERIFICATION,
      title: 'Verify your email',
      message: 'Verify your email address to activate all account features.',
      deduplicationKey: `auth:verify:${user.id}:${this.digest(verificationToken)}`,
      secureEmailMetadata: {
        actionUrl: `${this.config.get<string>('app.frontendUrl')}/verify-email?token=${encodeURIComponent(verificationToken)}`,
      },
    });
    return {
      user: this.safe(user),
      verificationToken:
        this.config.get('app.env') === 'development' ? verificationToken : undefined,
    };
  }
  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordValid = await verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, dto.password);
    if (!user || !passwordValid) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');
    const result = await this.issueSession(user.id, user.email, user.role, user.schoolId);
    await this.audit.record({
      actorId: user.id,
      action: 'LOGIN_SUCCEEDED',
      entityType: 'user',
      entityId: user.id,
    });
    return { ...result, user: this.safe(user) };
  }
  async issueSession(
    id: string,
    email: string,
    role: UserRole,
    schoolId: string | null,
    familyId: string = randomUUID(),
    manager: EntityManager = this.tokens.manager,
  ) {
    const payload = { sub: id, email, role, schoolId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithm: 'HS256',
      expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, familyId, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithm: 'HS256',
        expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    const decoded = this.jwt.decode<{ exp: number }>(refreshToken);
    await manager.getRepository(AuthToken).save({
      userId: id,
      tokenHash: this.digest(refreshToken),
      type: AuthTokenType.REFRESH,
      expiresAt: new Date(decoded.exp * 1000),
      familyId,
      revokedAt: null,
      consumedAt: null,
    });
    return { accessToken, refreshToken };
  }
  async refresh(raw: string) {
    let claims: {
      sub: string;
      email: string;
      role: UserRole;
      schoolId: string | null;
      familyId: string;
    };
    try {
      claims = await this.jwt.verifyAsync(raw, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const rotated = await this.tokens.manager.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [claims.familyId]);
      const tokenHash = this.digest(raw);
      const result = await manager.query(
        `UPDATE auth_tokens SET consumed_at=now(),updated_at=now()
         WHERE token_hash=$1 AND type='REFRESH' AND family_id=$2 AND consumed_at IS NULL
           AND revoked_at IS NULL AND expires_at>now()
         RETURNING family_id AS "familyId"`,
        [tokenHash, claims.familyId],
      );
      const consumed: Array<{ familyId: string }> = Array.isArray(result[0]) ? result[0] : result;
      if (!consumed[0]) {
        const record = await manager
          .getRepository(AuthToken)
          .findOneBy({ tokenHash, type: AuthTokenType.REFRESH });
        if (record?.familyId)
          await manager
            .getRepository(AuthToken)
            .update({ familyId: record.familyId }, { revokedAt: new Date() });
        return null;
      }
      return this.issueSession(
        claims.sub,
        claims.email,
        claims.role,
        claims.schoolId,
        consumed[0].familyId,
        manager,
      );
    });
    if (!rotated) throw new UnauthorizedException('Refresh token is invalid or reused');
    return rotated;
  }
  async logout(raw: string) {
    await this.tokens.update(
      { tokenHash: this.digest(raw), type: AuthTokenType.REFRESH, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
  async logoutAll(userId: string) {
    await this.tokens.update(
      { userId, type: AuthTokenType.REFRESH, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
  async issueOpaque(userId: string, type: AuthTokenType, ttlMs: number) {
    const raw = randomBytes(32).toString('base64url');
    await this.tokens.save({
      userId,
      type,
      tokenHash: this.digest(raw),
      expiresAt: new Date(Date.now() + ttlMs),
      revokedAt: null,
      consumedAt: null,
      familyId: null,
    });
    return raw;
  }
  async verifyEmail(raw: string) {
    await this.tokens.manager.transaction(async (manager) => {
      const token = await this.consumeOpaque(raw, AuthTokenType.EMAIL_VERIFICATION, manager);
      await manager.update(User, { id: token.userId }, { emailVerified: true });
      await manager.update(
        AuthToken,
        {
          userId: token.userId,
          type: AuthTokenType.EMAIL_VERIFICATION,
          consumedAt: IsNull(),
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );
    });
  }
  async forgotPassword(email: string) {
    const startedAt = Date.now();
    const user = await this.users.findByEmailWithPassword(email);
    if (!user) {
      await this.minimumAnonymousResponseTime(startedAt);
      return {};
    }
    const resetToken = await this.issueOpaque(
      user.id,
      AuthTokenType.PASSWORD_RESET,
      60 * 60 * 1000,
    );
    await this.notifications?.create({
      userId: user.id,
      type: NotificationType.PASSWORD_RESET,
      title: 'Reset your password',
      message:
        'A password reset was requested for your account. Ignore this email if it was not you.',
      deduplicationKey: `auth:reset:${user.id}:${this.digest(resetToken)}`,
      secureEmailMetadata: {
        actionUrl: `${this.config.get<string>('app.frontendUrl')}/reset-password?token=${encodeURIComponent(resetToken)}`,
      },
    });
    await this.minimumAnonymousResponseTime(startedAt);
    return { resetToken: this.config.get('app.env') === 'development' ? resetToken : undefined };
  }
  async resetPassword(raw: string, password: string) {
    const passwordHash = await hash(password);
    const token = await this.tokens.manager.transaction(async (manager) => {
      const consumed = await this.consumeOpaque(raw, AuthTokenType.PASSWORD_RESET, manager);
      await manager.update(User, { id: consumed.userId }, { passwordHash });
      await manager.update(
        AuthToken,
        { userId: consumed.userId, type: AuthTokenType.REFRESH, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await manager.update(
        AuthToken,
        {
          userId: consumed.userId,
          type: AuthTokenType.PASSWORD_RESET,
          consumedAt: IsNull(),
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );
      return consumed;
    });
    await this.notifications?.create({
      userId: token.userId,
      type: NotificationType.PASSWORD_CHANGED,
      title: 'Your password was changed',
      message:
        'Your account password was changed. Contact support immediately if this was not you.',
      deduplicationKey: `auth:password-changed:${token.id}`,
    });
  }
  private async consumeOpaque(raw: string, type: AuthTokenType, manager = this.tokens.manager) {
    const result = await manager.query(
      `UPDATE auth_tokens SET consumed_at=now(),updated_at=now()
       WHERE token_hash=$1 AND type=$2 AND consumed_at IS NULL
         AND revoked_at IS NULL AND expires_at>now()
       RETURNING id,user_id AS "userId"`,
      [this.digest(raw), type],
    );
    const rows: Array<{ id: string; userId: string }> = Array.isArray(result[0])
      ? result[0]
      : result;
    if (!rows[0]) throw new UnauthorizedException('Token is invalid or expired');
    return rows[0];
  }
  private async minimumAnonymousResponseTime(startedAt: number) {
    const remaining = 200 - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
