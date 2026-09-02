import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private active?: Promise<void>;

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

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.active)
      await Promise.race([this.active, new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    this.active = this.notifications
      .process()
      .then(() => undefined)
      .catch(() => this.logger.error('Notification delivery cycle failed'))
      .finally(() => {
        this.running = false;
        this.active = undefined;
      });
    await this.active;
  }
}
