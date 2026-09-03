import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('school_curriculum_publications')
export class SchoolCurriculumPublication {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'school_id', type: 'uuid' }) schoolId!: string;
  @Column({ name: 'chapter_id', type: 'uuid', nullable: true }) chapterId!: string | null;
  @Column({ name: 'topic_id', type: 'uuid', nullable: true }) topicId!: string | null;
  @Column({ name: 'published_by', type: 'uuid' }) publishedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
