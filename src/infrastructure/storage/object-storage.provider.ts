export const OBJECT_STORAGE_PROVIDER = Symbol('OBJECT_STORAGE_PROVIDER');
export interface StoredObjectMetadata {
  size: number;
  contentType?: string;
  modifiedAt: Date;
}
export interface ObjectStorageProvider {
  putObject(key: string, data: Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getMetadata(key: string): Promise<StoredObjectMetadata>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
}
