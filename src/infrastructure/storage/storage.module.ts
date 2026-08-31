import { Module } from '@nestjs/common';
import { LocalFilesystemStorageProvider } from './local-filesystem-storage.provider';
import { OBJECT_STORAGE_PROVIDER } from './object-storage.provider';
@Module({
  providers: [
    LocalFilesystemStorageProvider,
    { provide: OBJECT_STORAGE_PROVIDER, useExisting: LocalFilesystemStorageProvider },
  ],
  exports: [OBJECT_STORAGE_PROVIDER],
})
export class StorageModule {}
