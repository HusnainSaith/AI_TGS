import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}
  @Public() @Get() async check() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      application: 'up',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
