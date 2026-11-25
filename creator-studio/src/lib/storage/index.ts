/**
 * Object storage abstraction. `local` stores files under STORAGE_DIR (dev,
 * single-node). `s3` targets any S3-compatible service (AWS S3, R2, MinIO);
 * renders need local file paths, so S3 objects are cached on demand.
 * Files are always served through authenticated routes — never public URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';

export interface StorageDriver {
  readonly kind: 'local' | 's3';
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  /** Absolute local path (downloading to a cache for remote drivers). */
  localPath(key: string): Promise<string>;
  stream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  size(key: string): Promise<number>;
  delete(key: string): Promise<void>;
}

export function safeKey(key: string): string {
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(key) || key.includes('..') || key.startsWith('/')) throw new Error(`invalid storage key: ${key}`);
  return key;
}

export class LocalStorage implements StorageDriver {
  readonly kind = 'local' as const;
  constructor(private root: string) { fs.mkdirSync(root, { recursive: true }); }
  private p(key: string) { return path.join(this.root, safeKey(key)); }
  async put(key: string, data: Buffer) { const f = this.p(key); fs.mkdirSync(path.dirname(f), { recursive: true }); await fs.promises.writeFile(f, data); }
  async putFile(key: string, filePath: string) { const f = this.p(key); fs.mkdirSync(path.dirname(f), { recursive: true }); await fs.promises.copyFile(filePath, f); }
  async localPath(key: string) { return this.p(key); }
  async stream(key: string, range?: { start: number; end: number }) { return fs.createReadStream(this.p(key), range); }
  async size(key: string) { return (await fs.promises.stat(this.p(key))).size; }
  async delete(key: string) { await fs.promises.rm(this.p(key), { force: true }); }
}

/** S3-compatible driver (lazy-loads @aws-sdk/client-s3 only when configured). Not exercised against a live bucket in CI. */
export class S3Storage implements StorageDriver {
  readonly kind = 's3' as const;
  private cacheDir = path.join(os.tmpdir(), 'cs-s3-cache');
  private clientP: Promise<{ send: (cmd: unknown) => Promise<unknown>; mod: Record<string, new (input: unknown) => unknown> }> | null = null;
  constructor(private bucket: string) {}
  private client() {
    if (!this.clientP) {
      const modName = '@aws-sdk/client-s3';
      this.clientP = (import(/* webpackIgnore: true */ modName) as Promise<Record<string, unknown>>).then((mod) => {
        const S3Client = mod.S3Client as new (cfg: unknown) => { send: (cmd: unknown) => Promise<unknown> };
        const c = new S3Client({ region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: !!process.env.S3_ENDPOINT });
        return { send: (cmd: unknown) => c.send(cmd), mod: mod as Record<string, new (input: unknown) => unknown> };
      }).catch(() => { throw new Error('STORAGE_DRIVER=s3 requires the @aws-sdk/client-s3 package to be installed'); });
    }
    return this.clientP;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const { send, mod } = await this.client();
    await send(new mod.PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: contentType }));
  }
  async putFile(key: string, filePath: string, contentType: string) { await this.put(key, await fs.promises.readFile(filePath), contentType); }
  async localPath(key: string) {
    const f = path.join(this.cacheDir, safeKey(key));
    if (fs.existsSync(f)) return f;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const s = await this.stream(key);
    await new Promise<void>((res, rej) => s.pipe(fs.createWriteStream(f)).on('finish', () => res()).on('error', rej));
    return f;
  }
  async stream(key: string, range?: { start: number; end: number }) {
    const { send, mod } = await this.client();
    const r = (await send(new mod.GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Range: range ? `bytes=${range.start}-${range.end}` : undefined }))) as { Body: Readable };
    return r.Body;
  }
  async size(key: string) {
    const { send, mod } = await this.client();
    const r = (await send(new mod.HeadObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }))) as { ContentLength?: number };
    return r.ContentLength ?? 0;
  }
  async delete(key: string) {
    const { send, mod } = await this.client();
    await send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  if (process.env.STORAGE_DRIVER === 's3') {
    if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    driver = new S3Storage(process.env.S3_BUCKET);
  } else {
    driver = new LocalStorage(process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage/data'));
  }
  return driver;
}
export function setStorageForTests(d: StorageDriver | null) { driver = d; }
