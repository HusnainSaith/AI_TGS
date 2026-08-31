import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import {
  Board,
  Chapter,
  CurriculumClass,
  Subject,
  Topic,
} from '../../curriculum/curriculum.entities';
import { User } from '../../users/user.entity';
import { MappingStatus } from '../enums/knowledge-base.enums';
import { DocumentVersion } from './document-version.entity';

@Entity('document_topic_mappings')
@Index(['documentVersionId'])
@Index(['status'])
@Index(['boardId', 'classId', 'subjectId', 'chapterId', 'topicId'])
export class DocumentTopicMapping extends BaseEntity {
  @Column({ name: 'document_version_id', type: 'uuid' }) documentVersionId!: string;
  @ManyToOne(() => DocumentVersion, (v) => v.mappings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersion!: DocumentVersion;
  @Column({ name: 'board_id', type: 'uuid' }) boardId!: string;
  @ManyToOne(() => Board, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'board_id' }) board!: Board;
  @Column({ name: 'class_id', type: 'uuid', nullable: true }) classId!: string | null;
  @ManyToOne(() => CurriculumClass, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'class_id' })
  curriculumClass!: CurriculumClass | null;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true }) subjectId!: string | null;
  @ManyToOne(() => Subject, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject | null;
  @Column({ name: 'chapter_id', type: 'uuid', nullable: true }) chapterId!: string | null;
  @ManyToOne(() => Chapter, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chapter_id' })
  chapter!: Chapter | null;
  @Column({ name: 'topic_id', type: 'uuid', nullable: true }) topicId!: string | null;
  @ManyToOne(() => Topic, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'topic_id' })
  topic!: Topic | null;
  @Column({
    type: 'enum',
    enum: MappingStatus,
    enumName: 'kb_mapping_status',
    default: MappingStatus.DRAFT,
  })
  status!: MappingStatus;
  @Column({ name: 'mapped_by', type: 'uuid' }) mappedBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'mapped_by' }) mapper!: User;
  @Column({ name: 'approved_by', type: 'uuid', nullable: true }) approvedBy!: string | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'approved_by' })
  approver!: User | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason!: string | null;
}
