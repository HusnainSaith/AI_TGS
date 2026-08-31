import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { User } from '../users/user.entity';
import { CurriculumStatus } from './curriculum-status.enum';
@Entity('boards')
export class Board extends BaseEntity {
  @Index({ unique: true }) @Column({ length: 120 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
@Entity('classes')
@Index(['boardId', 'name'], { unique: true })
export class CurriculumClass extends BaseEntity {
  @Column({ name: 'board_id', type: 'uuid' }) boardId!: string;
  @ManyToOne(() => Board, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'board_id' }) board!: Board;
  @Column({ length: 60 }) name!: string;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
@Entity('sections')
@Index(['classId', 'name'], { unique: true })
export class Section extends BaseEntity {
  @Column({ name: 'class_id', type: 'uuid' }) classId!: string;
  @ManyToOne(() => CurriculumClass, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  curriculumClass!: CurriculumClass;
  @Column({ length: 30 }) name!: string;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
@Entity('subjects')
@Index(['classId', 'name', 'language'], { unique: true })
export class Subject extends BaseEntity {
  @Column({ name: 'class_id', type: 'uuid' }) classId!: string;
  @ManyToOne(() => CurriculumClass, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  curriculumClass!: CurriculumClass;
  @Column({ name: 'board_id', type: 'uuid' }) boardId!: string;
  @ManyToOne(() => Board, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'board_id' }) board!: Board;
  @Column({ length: 80 }) name!: string;
  @Column({ length: 20, default: 'en' }) language!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
@Entity('chapters')
@Index(['subjectId', 'chapterNumber'], { unique: true })
@Check('"chapter_number" > 0')
export class Chapter extends BaseEntity {
  @Column({ name: 'subject_id', type: 'uuid' }) subjectId!: string;
  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;
  @Column({ name: 'chapter_number', type: 'int' }) chapterNumber!: number;
  @Column({ length: 120 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
@Entity('topics')
@Index(['chapterId', 'name'], { unique: true })
@Check('"order" >= 0')
export class Topic extends BaseEntity {
  @Column({ name: 'chapter_id', type: 'uuid' }) chapterId!: string;
  @ManyToOne(() => Chapter, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chapter_id' })
  chapter!: Chapter;
  @Column({ length: 150 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'int', default: 0 }) order!: number;
  @Column({
    type: 'enum',
    enum: CurriculumStatus,
    enumName: 'curriculum_status',
    default: CurriculumStatus.ACTIVE,
  })
  status!: CurriculumStatus;
}
