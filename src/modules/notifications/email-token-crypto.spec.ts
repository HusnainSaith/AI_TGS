import { randomBytes } from 'node:crypto';
import { decryptEmailTemplateData, encryptEmailTemplateData } from './email-token-crypto';

describe('email token-link encryption', () => {
  const key = randomBytes(32);
  const binding = 'PASSWORD_RESET:user-id';

  it('uses a unique IV and authenticates the bound payload', () => {
    const first = encryptEmailTemplateData(
      { actionUrl: 'https://example.test/reset?t=secret' },
      key,
      binding,
    );
    const second = encryptEmailTemplateData(
      { actionUrl: 'https://example.test/reset?t=secret' },
      key,
      binding,
    );
    expect(first).not.toBe(second);
    expect(decryptEmailTemplateData(first, key, binding)).toEqual({
      actionUrl: 'https://example.test/reset?t=secret',
    });
  });

  it.each(['ciphertext', 'tag'] as const)('rejects tampered %s', (part) => {
    const encoded = encryptEmailTemplateData({ token: 'secret' }, key, binding).split('.');
    const index = part === 'tag' ? 1 : 2;
    encoded[index] = `${encoded[index]?.slice(0, -1)}${encoded[index]?.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decryptEmailTemplateData(encoded.join('.'), key, binding)).toThrow();
  });

  it('rejects a different purpose or user binding', () => {
    const encoded = encryptEmailTemplateData({ token: 'secret' }, key, binding);
    expect(() => decryptEmailTemplateData(encoded, key, 'EMAIL_VERIFICATION:user-id')).toThrow();
    expect(() => decryptEmailTemplateData(encoded, key, 'PASSWORD_RESET:other-user')).toThrow();
  });
});
