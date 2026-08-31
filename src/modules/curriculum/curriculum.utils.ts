import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CurriculumStatus } from './curriculum-status.enum';
export interface Page<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: { page: number; limit: number },
): Promise<Page<T>> {
  const [items, total] = await qb
    .skip((query.page - 1) * query.limit)
    .take(query.limit)
    .getManyAndCount();
  const totalPages = Math.ceil(total / query.limit);
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}
export function orderColumn(
  sortBy: string | undefined,
  allowed: Record<string, string>,
  fallback: string,
): string {
  return sortBy && allowed[sortBy] ? allowed[sortBy] : fallback;
}
export function translateUnique(error: unknown, message: string): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
    throw new ConflictException(message);
  throw error;
}
export function assertStatusFilterAllowed(status: CurriculumStatus, user: AuthenticatedUser): void {
  if (status === CurriculumStatus.ARCHIVED && user.role !== UserRole.SYSTEM_ADMIN) {
    throw new ForbiddenException('Only system administrators may list archived curriculum');
  }
}
