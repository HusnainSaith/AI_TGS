import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ObjectStorageProvider, StoredObjectMetadata } from './object-storage.provider';
@Injectable()
export class LocalFilesystemStorageProvider implements ObjectStorageProvider {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('storage.localRoot') ?? './storage');
  }
  private path(key: string) {
    if (!key || isAbsolute(key) || key.includes('\\'))
      throw new BadRequestException('Invalid storage key');
    const target = resolve(this.root, key);
    const rel = relative(this.root, target);
    if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel))
      throw new BadRequestException('Invalid storage key');
    return target;
  }
  async putObject(key: string, data: Buffer, _contentType?: string) {
    void _contentType;
    const target = this.path(key);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, data, { flag: 'wx' });
  }
  async getObject(key: string) {
    return readFile(this.path(key));
  }
  async getMetadata(key: string): Promise<StoredObjectMetadata> {
    const info = await stat(this.path(key));
    return { size: info.size, modifiedAt: info.mtime };
  }
  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
  async deleteObject(key: string) {
    await rm(this.path(key), { force: true });
  }
}
