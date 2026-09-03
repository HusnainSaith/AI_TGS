import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WORKER_MODULES } from './worker.module';

async function bootstrap() {
  const kind = process.argv[2] ?? 'all';
  const module = WORKER_MODULES[kind];
  if (!module) throw new Error(`Unknown worker kind: ${kind}`);
  if (process.env.QUEUES_ENABLED !== 'true') throw new Error('Workers require QUEUES_ENABLED=true');
  const app = await NestFactory.createApplicationContext(module, { bufferLogs: true });
  app.useLogger(['log', 'warn', 'error']);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  Logger.log(`worker ready kind=${kind}`, 'WorkerBootstrap');
}
void bootstrap();
