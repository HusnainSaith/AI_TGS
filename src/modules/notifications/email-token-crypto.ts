import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptEmailTemplateData(
  value: Record<string, unknown>,
  key: Buffer,
  binding: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(binding, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptEmailTemplateData(value: string, key: Buffer, binding: string) {
  const [iv, tag, encrypted] = value.split('.');
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted template data');
  const decode = (part: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid encrypted template data');
    const decoded = Buffer.from(part, 'base64url');
    if (decoded.toString('base64url') !== part) throw new Error('Invalid encrypted template data');
    return decoded;
  };
  const decipher = createDecipheriv('aes-256-gcm', key, decode(iv));
  decipher.setAAD(Buffer.from(binding, 'utf8'));
  decipher.setAuthTag(decode(tag));
  return JSON.parse(
    Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]).toString('utf8'),
  ) as Record<string, unknown>;
}
