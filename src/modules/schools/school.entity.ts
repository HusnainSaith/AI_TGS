import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
@Entity('schools')
export class School extends BaseEntity {
  @Column({ length: 150 }) name!: string;
  @Column({ type: 'text', nullable: true, name: 'logo_url' }) logoUrl!: string | null;
  @Column({ type: 'text', nullable: true }) address!: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 150, nullable: true }) email!: string | null;
  @Column({ type: 'varchar', length: 150, nullable: true }) website!: string | null;
  @Column({ type: 'text', nullable: true }) footer!: string | null;
}
