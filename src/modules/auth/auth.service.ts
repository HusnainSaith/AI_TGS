import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { hash, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthToken, AuthTokenType } from './auth-token.entity';
import { LoginDto, RegisterDto } from './auth.dto';
type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  emailVerified: boolean;
};
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(AuthToken) private readonly tokens: Repository<AuthToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
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
    return {
      user: this.safe(user),
      verificationToken:
        this.config.get('app.env') === 'development' ? verificationToken : undefined,
    };
  }
  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    if (!user || !(await verify(user.passwordHash, dto.password)))
      throw new UnauthorizedException('Invalid credentials');
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
  async issueSession(id: string, email: string, role: UserRole, schoolId: string | null) {
    const familyId = randomUUID();
    const payload = { sub: id, email, role, schoolId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, familyId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    const decoded = this.jwt.decode<{ exp: number }>(refreshToken);
    await this.tokens.save({
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
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const record = await this.tokens.findOneBy({
      tokenHash: this.digest(raw),
      type: AuthTokenType.REFRESH,
    });
    if (!record || record.revokedAt || record.consumedAt || record.expiresAt <= new Date()) {
      if (record?.familyId)
        await this.tokens.update({ familyId: record.familyId }, { revokedAt: new Date() });
      throw new UnauthorizedException('Refresh token is invalid or reused');
    }
    record.consumedAt = new Date();
    await this.tokens.save(record);
    return this.issueSession(claims.sub, claims.email, claims.role, claims.schoolId);
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
    const token = await this.consumeOpaque(raw, AuthTokenType.EMAIL_VERIFICATION);
    await this.tokens.manager.update('users', { id: token.userId }, { email_verified: true });
  }
  async forgotPassword(email: string) {
    const user = await this.users.findByEmailWithPassword(email);
    if (!user) return {};
    const resetToken = await this.issueOpaque(
      user.id,
      AuthTokenType.PASSWORD_RESET,
      60 * 60 * 1000,
    );
    return { resetToken: this.config.get('app.env') === 'development' ? resetToken : undefined };
  }
  async resetPassword(raw: string, password: string) {
    const token = await this.consumeOpaque(raw, AuthTokenType.PASSWORD_RESET);
    await this.tokens.manager.update(
      'users',
      { id: token.userId },
      { password_hash: await hash(password) },
    );
    await this.logoutAll(token.userId);
  }
  private async consumeOpaque(raw: string, type: AuthTokenType) {
    const token = await this.tokens.findOneBy({ tokenHash: this.digest(raw), type });
    if (!token || token.consumedAt || token.revokedAt || token.expiresAt <= new Date())
      throw new UnauthorizedException('Token is invalid or expired');
    token.consumedAt = new Date();
    return this.tokens.save(token);
  }
}
