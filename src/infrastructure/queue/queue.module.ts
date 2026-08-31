import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from './queue.constants';
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        connection: {
          host: c.getOrThrow('redis.host'),
          port: c.getOrThrow('redis.port'),
          password: c.get('redis.password'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),
    BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
