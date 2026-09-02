import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { isEmail } from 'class-validator';
import { EmailMessage, EmailProvider } from '../../infrastructure/providers/provider.contracts';

export class EmailProviderError extends Error {
  constructor(
    readonly code:
      | 'EMAIL_NOT_CONFIGURED'
      | 'EMAIL_INVALID_RECIPIENT'
      | 'EMAIL_TEMPORARY_FAILURE'
      | 'EMAIL_PERMANENT_FAILURE',
  ) {
    super(code);
  }
}
@Injectable()
export class NodemailerEmailProvider implements EmailProvider, OnApplicationShutdown {
  readonly name = 'smtp';
  readonly configured: boolean;
  private readonly transport: Transporter | null;
  private readonly from: { name: string; address: string };
  constructor(config: ConfigService) {
    const host = config.get<string>('email.smtp.host') ?? '';
    const port = config.get<number>('email.smtp.port') ?? 587;
    const user = config.get<string>('email.smtp.user') ?? '';
    const password = config.get<string>('email.smtp.password') ?? '';
    this.from = {
      name: config.get<string>('email.fromName') ?? 'AI Test Generation',
      address: config.get<string>('email.fromEmail') ?? '',
    };
    this.configured = Boolean(host && this.from.address && (!user || password));
    this.transport = this.configured
      ? nodemailer.createTransport({
          host,
          port,
          secure: config.get<boolean>('email.smtp.secure') ?? port === 465,
          pool: true,
          maxConnections: 3,
          auth: user ? { user, pass: password } : undefined,
          connectionTimeout: config.get<number>('email.smtp.connectionTimeoutMs'),
          greetingTimeout: config.get<number>('email.smtp.greetingTimeoutMs'),
          socketTimeout: config.get<number>('email.smtp.socketTimeoutMs'),
          tls: { rejectUnauthorized: true },
        })
      : null;
  }
  async send(message: EmailMessage) {
    if (
      !isEmail(message.to) ||
      /[\r\n]/.test(message.to) ||
      /[\r\n]/.test(message.subject) ||
      (message.replyTo && (!isEmail(message.replyTo) || /[\r\n]/.test(message.replyTo)))
    )
      throw new EmailProviderError('EMAIL_INVALID_RECIPIENT');
    if (!this.transport) throw new EmailProviderError('EMAIL_NOT_CONFIGURED');
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'responseCode' in error
          ? Number(error.responseCode)
          : 0;
      throw new EmailProviderError(
        code === 550
          ? 'EMAIL_INVALID_RECIPIENT'
          : code >= 500
            ? 'EMAIL_PERMANENT_FAILURE'
            : 'EMAIL_TEMPORARY_FAILURE',
      );
    }
  }
  async verify() {
    if (!this.transport) return false;
    return this.transport.verify();
  }
  onApplicationShutdown() {
    this.transport?.close();
  }
}
