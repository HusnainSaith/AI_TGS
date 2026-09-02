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
    extra: {
      max: config.get<number>('database.poolMax') ?? 10,
      idleTimeoutMillis: config.get<number>('database.idleTimeoutMs') ?? 30000,
      connectionTimeoutMillis: config.get<number>('database.connectionTimeoutMs') ?? 10000,
    },
  };
}
