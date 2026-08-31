import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFilesystemStorageProvider } from '../src/infrastructure/storage/local-filesystem-storage.provider';

describe('LocalFilesystemStorageProvider', () => {
  let root: string;
  let storage: LocalFilesystemStorageProvider;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tgs-kb-storage-'));
    storage = new LocalFilesystemStorageProvider(
      new ConfigService({ storage: { localRoot: root } }),
    );
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));
  it('writes, reads, reports, and removes a generated key', async () => {
    const key = 'quarantine/global/generated-id';
    await storage.putObject(key, Buffer.from('safe'), 'text/plain');
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.getObject(key)).toString()).toBe('safe');
    expect((await storage.getMetadata(key)).size).toBe(4);
    await storage.deleteObject(key);
    expect(await storage.exists(key)).toBe(false);
  });
  it('rejects traversal and absolute paths', async () => {
    await expect(
      storage.putObject('../escape', Buffer.from('x'), 'text/plain'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(storage.getObject('C:\\escape')).rejects.toBeInstanceOf(BadRequestException);
  });
});
