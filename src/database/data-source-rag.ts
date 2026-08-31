import dataSource from './data-source';
import { DataSource } from 'typeorm';
export default new DataSource({
  ...dataSource.options,
  migrations: ['src/database/rag-migrations/*.ts'],
  migrationsTableName: 'rag_migrations',
});
