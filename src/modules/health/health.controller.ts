import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}
  @Public() @Get() async check() {
    let database: 'up' | 'down' = 'down';
    let pgvector: { status: 'up' | 'down'; version: string | null } = {
      status: 'down',
      version: null,
    };
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
      const rows = await this.dataSource.query(
        `SELECT extversion FROM pg_extension WHERE extname='vector'`,
      );
      if (rows[0]?.extversion) pgvector = { status: 'up', version: String(rows[0].extversion) };
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      application: 'up',
      database,
      pgvector,
      embeddingProvider: {
        provider: this.config.get<string>('embedding.provider') ?? null,
        model: this.config.get<string>('embedding.model') ?? null,
        configured:
          this.config.get<string>('embedding.provider') === 'test' ||
          Boolean(this.config.get<string>('embedding.apiKey')),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
