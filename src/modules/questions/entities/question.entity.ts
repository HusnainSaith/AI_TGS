import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { Chapter, CurriculumClass, Subject, Topic } from '../../curriculum/curriculum.entities';
import { User } from '../../users/user.entity';
import {
  GroundingStatus,
  QuestionDifficulty,
  QuestionReviewStatus,
  QuestionSource,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from '../enums/question.enums';
import { QuestionOption } from './question-option.entity';
const numericTransformer = { to: (v: number) => v, from: (v: string) => Number(v) };
@Entity('questions')
@Index(['createdBy', 'topicId'])
@Check('marks > 0')
@Check('length(btrim(question_text)) > 0')
export class Question extends BaseEntity {
  @Column({
    type: 'enum',
    enum: QuestionVisibility,
    enumName: 'question_visibility',
    default: QuestionVisibility.PRIVATE,
  })
  visibility!: QuestionVisibility;
  @Column({ name: 'shared_school_id', type: 'uuid', nullable: true }) sharedSchoolId!:
    string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'topic_id', type: 'uuid' }) topicId!: string;
  @ManyToOne(() => Topic, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'topic_id' }) topic!: Topic;
  @Column({ name: 'chapter_id', type: 'uuid' }) chapterId!: string;
  @ManyToOne(() => Chapter, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chapter_id' })
  chapter!: Chapter;
  @Column({ name: 'subject_id', type: 'uuid' }) subjectId!: string;
  @ManyToOne(() => Subject, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;
  @Column({ name: 'class_id', type: 'uuid' }) classId!: string;
  @ManyToOne(() => CurriculumClass, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  curriculumClass!: CurriculumClass;
  @Column({ type: 'enum', enum: QuestionType, enumName: 'question_type' }) type!: QuestionType;
  @Column({ name: 'question_text', type: 'text' }) questionText!: string;
  @Column({ type: 'enum', enum: QuestionDifficulty, enumName: 'question_difficulty' })
  difficulty!: QuestionDifficulty;
  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  marks!: number;
  @Column({ type: 'text', nullable: true }) explanation!: string | null;
  @Column({ type: 'enum', enum: QuestionSource, enumName: 'question_source' })
  source!: QuestionSource;
  @Column({
    name: 'review_status',
    type: 'enum',
    enum: QuestionReviewStatus,
    enumName: 'question_review_status',
  })
  reviewStatus!: QuestionReviewStatus;
  @Column({ name: 'generation_job_id', type: 'uuid', nullable: true }) generationJobId!:
    string | null;
  @Column({ name: 'generation_job_item_id', type: 'uuid', nullable: true }) generationJobItemId!:
    string | null;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;
  @Column({
    type: 'enum',
    enum: QuestionStatus,
    enumName: 'question_status',
    default: QuestionStatus.ACTIVE,
  })
  status!: QuestionStatus;
  @Column({
    name: 'grounding_status',
    type: 'enum',
    enum: GroundingStatus,
    enumName: 'grounding_status',
  })
  groundingStatus!: GroundingStatus;
  @Column({ name: 'retrieval_event_id', type: 'uuid', nullable: true }) retrievalEventId!:
    string | null;
  @OneToMany(() => QuestionOption, (o) => o.question) options!: QuestionOption[];
}
