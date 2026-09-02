import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthToken, AuthTokenType } from '../src/modules/auth/auth-token.entity';
import { AuthService } from '../src/modules/auth/auth.service';
import { UserRole } from '../src/common/enums/user-role.enum';
import { User } from '../src/modules/users/user.entity';
import { UsersService } from '../src/modules/users/users.service';

const describeDatabase = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('authentication token security with PostgreSQL', () => {
  let database: DataSource;
  let auth: AuthService;
  const userId = randomUUID();

  beforeAll(async () => {
    database = new DataSource({ ...dataSource.options, name: 'auth-security-tests' });
    await database.initialize();
    await database.getRepository(User).insert({
      id: userId,
      name: 'Security Test',
      email: `${userId}@example.invalid`,
      passwordHash:
        '$argon2id$v=19$m=65536,t=3,p=4$92sKQndROh3TZ+4RVLzf+w$a42+0bOI0jPNe/hHhap3fr4LK7mg4dFmbuahzmVBNhI',
      role: UserRole.TEACHER,
      emailVerified: false,
      schoolId: null,
    });
    const users = new UsersService(database.getRepository(User), database.getRepository(AuthToken));
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    auth = new AuthService(users, database.getRepository(AuthToken), new JwtService(), config, {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService);
  });

  afterAll(async () => {
    await database.getRepository(User).delete(userId);
    await database.destroy();
  });

  it('enforces purpose, expiry, and atomic one-time reset consumption', async () => {
    const reset = await auth.issueOpaque(userId, AuthTokenType.PASSWORD_RESET, 60_000);
    await expect(auth.verifyEmail(reset)).rejects.toThrow('Token is invalid or expired');
    const attempts = await Promise.allSettled([
      auth.resetPassword(reset, 'a-new-secure-password'),
      auth.resetPassword(reset, 'a-new-secure-password'),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    await expect(auth.resetPassword(reset, 'another-secure-password')).rejects.toThrow(
      'Token is invalid or expired',
    );
    const expired = await auth.issueOpaque(userId, AuthTokenType.EMAIL_VERIFICATION, -1);
    await expect(auth.verifyEmail(expired)).rejects.toThrow('Token is invalid or expired');
  });

  it('rotates refresh tokens atomically and revokes the family on replay', async () => {
    const session = await auth.issueSession(
      userId,
      `${userId}@example.invalid`,
      UserRole.TEACHER,
      null,
    );
    const attempts = await Promise.allSettled([
      auth.refresh(session.refreshToken),
      auth.refresh(session.refreshToken),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const rotated = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<{ accessToken: string; refreshToken: string }> =>
        attempt.status === 'fulfilled',
    );
    await expect(auth.refresh(rotated!.value.refreshToken)).rejects.toThrow(
      'Refresh token is invalid or reused',
    );
  });
});
