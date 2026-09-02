import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { hash, verify } from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import { User } from './user.entity';
import { AuthToken, AuthTokenType } from '../auth/auth-token.entity';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthToken) private readonly tokens: Repository<AuthToken>,
  ) {}
  findByEmailWithPassword(email: string) {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
  }
  findById(id: string) {
    return this.users.findOneBy({ id });
  }
  create(input: Pick<User, 'name' | 'email' | 'passwordHash' | 'role' | 'schoolId'>) {
    return this.users.save(this.users.create(input));
  }
  async updateProfile(id: string, input: { name?: string; phone?: string }) {
    await this.users.update(id, input);
    return this.findById(id);
  }
  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const current = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
    if (!current || !(await verify(current.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hash(newPassword);
    await this.users.manager.transaction(async (manager) => {
      await manager.update(User, id, { passwordHash });
      await manager.update(
        AuthToken,
        { userId: id, type: AuthTokenType.REFRESH, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await manager.update(
        AuthToken,
        { userId: id, type: AuthTokenType.PASSWORD_RESET, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }
}
