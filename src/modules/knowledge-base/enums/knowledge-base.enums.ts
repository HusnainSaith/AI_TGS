export enum TenantScope {
  GLOBAL = 'GLOBAL',
  SCHOOL = 'SCHOOL',
}
export enum KnowledgeDocumentStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  READY_FOR_MAPPING = 'READY_FOR_MAPPING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}
export enum KnowledgeSourceType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  TXT = 'TXT',
  ADMIN_NOTE = 'ADMIN_NOTE',
}
export enum ExtractionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
export enum MalwareScanStatus {
  NOT_SCANNED = 'NOT_SCANNED',
  PENDING = 'PENDING',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  FAILED = 'FAILED',
}
