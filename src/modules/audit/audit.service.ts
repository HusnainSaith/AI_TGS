import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
export interface AuditEntry {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  outcome?: string;
}
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repository = manager?.getRepository(AuditLog) ?? this.logs;
    const log = repository.create({
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      outcome: entry.outcome ?? 'SUCCEEDED',
    });
    await repository.save(log);
  }
}
