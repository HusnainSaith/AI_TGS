import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamTest } from './test.entity';
import { TestSection } from './test-section.entity';
import { Question } from '../../questions/entities/question.entity';
import {
  GroundingStatus,
  QuestionDifficulty,
  QuestionReviewStatus,
  QuestionSource,
  QuestionType,
} from '../../questions/enums/question.enums';
export interface OptionSnapshot {
  optionText: string;
  optionOrder: number;
  isCorrect: boolean;
}
export interface CitationSnapshot {
  documentVersionId: string;
  contentChunkId: string;
  locator: Record<string, unknown>;
  excerptHash: string;
  retrievalScore: number | null;
  citationOrder: number;
}
@Entity('test_questions')
@Index(['testSectionId', 'position'], { unique: true })
@Index(['testId', 'sourceQuestionId'], { unique: true })
@Check('position>0')
@Check('marks_snapshot>0')
export class TestQuestion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'test_id', type: 'uuid' }) testId!: string;
  @ManyToOne(() => ExamTest, (t) => t.questions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id' })
  test!: ExamTest;
  @Column({ name: 'test_section_id', type: 'uuid' }) testSectionId!: string;
  @ManyToOne(() => TestSection, (section) => section.questions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_section_id' })
  section!: TestSection;
  @Column({ name: 'source_question_id', type: 'uuid' }) sourceQuestionId!: string;
  @ManyToOne(() => Question, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'source_question_id' })
  sourceQuestion!: Question;
  @Column({ type: 'integer' }) position!: number;
  @Column({ type: 'enum', enum: QuestionType, enumName: 'question_type' }) type!: QuestionType;
  @Column({ name: 'question_text_snapshot', type: 'text' }) questionTextSnapshot!: string;
  @Column({
    name: 'marks_snapshot',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  marksSnapshot!: number;
  @Column({
    name: 'difficulty_snapshot',
    type: 'enum',
    enum: QuestionDifficulty,
    enumName: 'question_difficulty',
  })
  difficultySnapshot!: QuestionDifficulty;
  @Column({ name: 'language_snapshot', length: 20 }) languageSnapshot!: string;
  @Column({ name: 'options_snapshot', type: 'jsonb', nullable: true }) optionsSnapshot!:
    OptionSnapshot[] | null;
  @Column({ name: 'answer_snapshot', type: 'jsonb', nullable: true }) answerSnapshot!: Record<
    string,
    unknown
  > | null;
  @Column({ name: 'explanation_snapshot', type: 'text', nullable: true }) explanationSnapshot!:
    string | null;
  @Column({
    name: 'source_snapshot',
    type: 'enum',
    enum: QuestionSource,
    enumName: 'question_source',
  })
  sourceSnapshot!: QuestionSource;
  @Column({
    name: 'grounding_status_snapshot',
    type: 'enum',
    enum: GroundingStatus,
    enumName: 'grounding_status',
  })
  groundingStatusSnapshot!: GroundingStatus;
  @Column({
    name: 'review_status_snapshot',
    type: 'enum',
    enum: QuestionReviewStatus,
    enumName: 'question_review_status',
  })
  reviewStatusSnapshot!: QuestionReviewStatus;
  @Column({ name: 'citation_snapshot', type: 'jsonb', nullable: true }) citationSnapshot!:
    CitationSnapshot[] | null;
  @Column({ name: 'chapter_id_snapshot', type: 'uuid' }) chapterIdSnapshot!: string;
  @Column({ name: 'topic_id_snapshot', type: 'uuid' }) topicIdSnapshot!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
