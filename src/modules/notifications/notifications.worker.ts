import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const interval = this.config.get<number>('email.workerIntervalMs') ?? 5000;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.process();
    } catch (error) {
      this.logger.error('Notification delivery cycle failed', error);
    } finally {
      this.running = false;
    }
  }
}
