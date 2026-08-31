import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
export function databaseOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.getOrThrow('database.host'),
    port: config.getOrThrow('database.port'),
    database: config.getOrThrow('database.name'),
    username: config.getOrThrow('database.user'),
    password: config.getOrThrow('database.password'),
    ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: true } : false,
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    logging: config.get('app.env') === 'development',
  };
}
