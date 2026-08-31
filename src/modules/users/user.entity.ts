import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { School } from '../schools/school.entity';
@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 120 }) name!: string;
  @Index({ unique: true }) @Column({ length: 150 }) email!: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) phone!: string | null;
  @Column({ name: 'password_hash', length: 255, select: false }) passwordHash!: string;
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' }) role!: UserRole;
  @Column({ type: 'text', nullable: true, name: 'profile_image' }) profileImage!: string | null;
  @Column({ default: false, name: 'email_verified' }) emailVerified!: boolean;
  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status', default: UserStatus.ACTIVE })
  status!: UserStatus;
  @Column({ type: 'uuid', nullable: true, name: 'school_id' }) schoolId!: string | null;
  @ManyToOne(() => School, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'school_id' })
  school!: School | null;
}
