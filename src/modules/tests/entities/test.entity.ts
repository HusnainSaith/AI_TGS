import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  VersionColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../users/user.entity';
import { School } from '../../schools/school.entity';
import { CurriculumClass, Section, Subject } from '../../curriculum/curriculum.entities';
import { TestStatus } from '../test.enums';
import { TestQuestion } from './test-question.entity';
@Entity('tests')
@Index(['createdBy'])
@Index(['status'])
@Index(['classId'])
@Index(['subjectId'])
@Check('duration_minutes IS NULL OR duration_minutes>0')
@Check('total_marks>=0')
@Check('total_questions>=0')
export class ExamTest extends BaseEntity {
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;
  @Column({ name: 'school_id', type: 'uuid', nullable: true }) schoolId!: string | null;
  @ManyToOne(() => School, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school!: School | null;
  @Column({ name: 'class_id', type: 'uuid' }) classId!: string;
  @ManyToOne(() => CurriculumClass, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  curriculumClass!: CurriculumClass;
  @Column({ name: 'section_id', type: 'uuid', nullable: true }) sectionId!: string | null;
  @ManyToOne(() => Section, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'section_id' })
  section!: Section | null;
  @Column({ name: 'subject_id', type: 'uuid' }) subjectId!: string;
  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;
  @Column({ length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'text', nullable: true }) instructions!: string | null;
  @Column({ length: 20, default: 'en' }) language!: string;
  @Column({ type: 'enum', enum: TestStatus, enumName: 'test_status' }) status!: TestStatus;
  @Column({ name: 'duration_minutes', type: 'integer', nullable: true }) durationMinutes!:
    number | null;
  @Column({
    name: 'total_marks',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  totalMarks!: number;
  @Column({ name: 'total_questions', type: 'integer', default: 0 }) totalQuestions!: number;
  @VersionColumn({ type: 'integer' }) version!: number;
  @Column({ name: 'cloned_from_test_id', type: 'uuid', nullable: true }) clonedFromTestId!:
    string | null;
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true }) finalizedAt!: Date | null;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt!: Date | null;
  @OneToMany(() => TestQuestion, (q) => q.test) questions!: TestQuestion[];
}
