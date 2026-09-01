import dataSource from './data-source';
import { DataSource } from 'typeorm';
import { Foundation1725000000000 } from './migrations/1725000000000-Foundation';
import { CurriculumLifecycle1725100000000 } from './migrations/1725100000000-CurriculumLifecycle';
import { ManualQuestionBank1725300000000 } from './migrations/1725300000000-ManualQuestionBank';
import { KnowledgeBaseFoundation1725400000000 } from './migrations/1725400000000-KnowledgeBaseFoundation';
import { IngestionProcessing1725500000000 } from './migrations/1725500000000-IngestionProcessing';
import { CurriculumMappingReview1725600000000 } from './migrations/1725600000000-CurriculumMappingReview';
import { MalwareScanning1725700000000 } from './migrations/1725700000000-MalwareScanning';

export default new DataSource({
  ...dataSource.options,
  migrations: [
    Foundation1725000000000,
    CurriculumLifecycle1725100000000,
    ManualQuestionBank1725300000000,
    KnowledgeBaseFoundation1725400000000,
    IngestionProcessing1725500000000,
    CurriculumMappingReview1725600000000,
    MalwareScanning1725700000000,
  ],
});
