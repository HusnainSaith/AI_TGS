import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { configuration } from '../src/config/configuration';
import { NodemailerEmailProvider } from '../src/modules/notifications/nodemailer-email.provider';

loadEnv();

async function main() {
  const provider = new NodemailerEmailProvider(new ConfigService(configuration()));
  if (!provider.configured) throw new Error('SMTP is not fully configured');
  if (!(await provider.verify())) throw new Error('SMTP server rejected verification');
  process.stdout.write('SMTP configuration verified successfully.\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
