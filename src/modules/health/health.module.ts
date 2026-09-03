import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { QueueModule } from '../../infrastructure/queue/queue.module';
@Module({ imports: [QueueModule], controllers: [HealthController] })
export class HealthModule {}
