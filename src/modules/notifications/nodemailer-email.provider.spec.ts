import { ConfigService } from '@nestjs/config';
import { NodemailerEmailProvider } from './nodemailer-email.provider';

describe('NodemailerEmailProvider', () => {
  const provider = new NodemailerEmailProvider(
    new ConfigService({
      email: {
        fromEmail: 'noreply@example.test',
        fromName: 'TGS',
        smtp: { host: '', port: 587, secure: false },
      },
    }),
  );

  it.each([
    ['victim@example.test\r\nBcc: attacker@example.test', 'Subject'],
    ['victim@example.test', 'Subject\r\nBcc: attacker@example.test'],
  ])('rejects email header injection before transport use', async (to, subject) => {
    await expect(
      provider.send({ to, subject, text: 'safe', html: '<p>safe</p>' }),
    ).rejects.toMatchObject({ code: 'EMAIL_INVALID_RECIPIENT' });
  });

  it('fails closed when SMTP is not configured', async () => {
    await expect(
      provider.send({
        to: 'teacher@example.test',
        subject: 'Completed',
        text: 'Done',
        html: '<p>Done</p>',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  });
});
