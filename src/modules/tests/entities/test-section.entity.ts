import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamTest } from './test.entity';
import { TestQuestion } from './test-question.entity';

@Entity('test_sections')
@Index(['testId', 'position'], { unique: true })
@Check('position>0')
export class TestSection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'test_id', type: 'uuid' }) testId!: string;
  @ManyToOne(() => ExamTest, (test) => test.sections, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id' })
  test!: ExamTest;
  @Column({ length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) instructions!: string | null;
  @Column({ type: 'integer' }) position!: number;
  @OneToMany(() => TestQuestion, (question) => question.section) questions!: TestQuestion[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
