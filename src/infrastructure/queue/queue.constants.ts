export const QUEUES = {
  KB_INGESTION: 'kb-ingestion',
  EMBEDDINGS: 'embeddings',
  AI_GENERATION: 'ai-generation',
  PDF_EXPORTS: 'pdf-exports',
} as const;

export const QUEUE_JOB_NAMES = {
  INGEST: 'ingest',
  EMBED: 'embed',
  GENERATE: 'generate',
  EXPORT_PDF: 'export-pdf',
} as const;

export interface DurableJobPayload {
  jobId: string;
}
