import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Question } from './question.entity';
@Entity('question_options')
@Index(['questionId', 'optionOrder'], { unique: true })
@Check('"option_order" BETWEEN 1 AND 4')
@Check('length(btrim(option_text)) > 0')
export class QuestionOption {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @ManyToOne(() => Question, (q) => q.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: Question;
  @Column({ name: 'option_text', type: 'text' }) optionText!: string;
  @Column({ name: 'option_order', type: 'smallint' }) optionOrder!: number;
  @Column({ name: 'is_correct', default: false }) isCorrect!: boolean;
}
