import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { School } from '../../schools/school.entity';
import { User } from '../../users/user.entity';
import {
  KnowledgeDocumentStatus,
  KnowledgeSourceType,
  TenantScope,
} from '../enums/knowledge-base.enums';
import { DocumentVersion } from './document-version.entity';

export interface RightsMetadata {
  permissionConfirmed: boolean;
  sourceOwner: string;
  rightsType?: string;
  licence?: string;
  notes?: string;
}

@Entity('knowledge_documents')
@Index(['tenantScope'])
@Index(['schoolId'])
@Index(['status'])
@Index(['createdBy'])
@Index(['createdAt'])
export class KnowledgeDocument extends BaseEntity {
  @Column({ name: 'tenant_scope', type: 'enum', enum: TenantScope, enumName: 'kb_tenant_scope' })
  tenantScope!: TenantScope;
  @Column({ name: 'school_id', type: 'uuid', nullable: true }) schoolId!: string | null;
  @ManyToOne(() => School, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school!: School | null;
  @Column({ length: 250 }) title!: string;
  @Column({
    name: 'source_type',
    type: 'enum',
    enum: KnowledgeSourceType,
    enumName: 'kb_source_type',
  })
  sourceType!: KnowledgeSourceType;
  @Column({ length: 20, default: 'en' }) language!: string;
  @Column({ name: 'rights_metadata', type: 'jsonb' }) rightsMetadata!: RightsMetadata;
  @Column({
    type: 'enum',
    enum: KnowledgeDocumentStatus,
    enumName: 'kb_document_status',
    default: KnowledgeDocumentStatus.DRAFT,
  })
  status!: KnowledgeDocumentStatus;
  @Column({ name: 'active_version_id', type: 'uuid', nullable: true }) activeVersionId!:
    string | null;
  @OneToOne(() => DocumentVersion, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'active_version_id' })
  activeVersion!: DocumentVersion | null;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator!: User;
  @OneToMany(() => DocumentVersion, (v) => v.document) versions!: DocumentVersion[];
}
