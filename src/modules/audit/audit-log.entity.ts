import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog extends BaseEntity {
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!: string | null;
  @Column({ length: 80 }) action!: string;
  @Column({ name: 'entity_type', length: 60 }) entityType!: string;
  @Column({ name: 'entity_id', type: 'uuid', nullable: true }) entityId!: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @Column({ length: 20, default: 'SUCCEEDED' }) outcome!: string;
}
