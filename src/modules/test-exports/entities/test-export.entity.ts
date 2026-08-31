import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamTest } from '../../tests/entities/test.entity';
import { User } from '../../users/user.entity';
import { UsageReservation } from '../../subscriptions/entities/usage-reservation.entity';
import { TestExportStatus, TestExportType } from '../test-export.enums';
@Entity('test_exports')
@Index(['testId', 'type', 'renderVersion'])
@Index(['requestedBy'])
@Index(['status'])
export class TestExport {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'test_id', type: 'uuid' }) testId!: string;
  @ManyToOne(() => ExamTest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id' })
  test!: ExamTest;
  @Column({ name: 'requested_by', type: 'uuid' }) requestedBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requester!: User;
  @Column({ type: 'enum', enum: TestExportType, enumName: 'test_export_type' })
  type!: TestExportType;
  @Column({ type: 'enum', enum: TestExportStatus, enumName: 'test_export_status' })
  status!: TestExportStatus;
  @Column({ name: 'storage_key', type: 'varchar', length: 300, nullable: true }) storageKey!:
    string | null;
  @Column({ length: 180 }) filename!: string;
  @Column({ name: 'mime_type', length: 80, default: 'application/pdf' }) mimeType!: string;
  @Column({
    name: 'size_bytes',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  sizeBytes!: number | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) sha256!: string | null;
  @Column({ name: 'render_version', length: 64 }) renderVersion!: string;
  @Column({ name: 'test_snapshot_version', type: 'integer' }) testSnapshotVersion!: number;
  @Column({ name: 'usage_reservation_id', type: 'uuid', nullable: true }) usageReservationId!:
    string | null;
  @ManyToOne(() => UsageReservation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usage_reservation_id' })
  usageReservation!: UsageReservation | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 180, nullable: true })
  idempotencyKey!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'processing_token', type: 'uuid', nullable: true }) processingToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true }) failedAt!: Date | null;
  @Column({ name: 'download_count', type: 'integer', default: 0 }) downloadCount!: number;
  @Column({ name: 'last_downloaded_at', type: 'timestamptz', nullable: true })
  lastDownloadedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
