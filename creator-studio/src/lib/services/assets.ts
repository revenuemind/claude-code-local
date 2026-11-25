/** Assets: uploads, generated media, renders. All access is scoped by org. */
import { and, desc, eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DB } from '../db/client';
import { assets } from '../db/schema';
import { storage } from '../storage';
import { probe } from '../media/ffmpeg';
import { badRequest, notFound, type Actor, assertCan } from './context';
import { audit } from './audit';

export type AssetKind = 'image' | 'video' | 'audio' | 'subtitle' | 'render' | 'thumbnail' | 'document';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 500) * 1024 * 1024;

/** Detect the real file type from magic bytes. Client-provided MIME types are never trusted. */
export function sniffMime(buf: Buffer): { mime: string; kind: AssetKind; ext: string } | null {
  const h = (n: number) => buf.subarray(0, n);
  const ascii = (s: number, e: number) => buf.subarray(s, e).toString('latin1');
  if (h(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', kind: 'image', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', kind: 'image', ext: 'jpg' };
  if (ascii(0, 4) === 'GIF8') return { mime: 'image/gif', kind: 'image', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image', ext: 'webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { mime: 'audio/wav', kind: 'audio', ext: 'wav' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand.startsWith('M4A') || brand === 'M4B ') return { mime: 'audio/mp4', kind: 'audio', ext: 'm4a' };
    if (brand === 'qt  ') return { mime: 'video/quicktime', kind: 'video', ext: 'mov' };
    return { mime: 'video/mp4', kind: 'video', ext: 'mp4' };
  }
  if (h(4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mime: 'video/webm', kind: 'video', ext: 'webm' };
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio', ext: 'mp3' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', kind: 'audio', ext: 'ogg' };
  if (ascii(0, 6) === 'WEBVTT') return { mime: 'text/vtt', kind: 'subtitle', ext: 'vtt' };
  return null;
}

function cleanName(name: string): string {
  return (name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 80)) || 'file';
}

export interface CreateAssetInput {
  orgId: string; createdBy?: string | null; projectId?: string | null; brandId?: string | null;
  name: string; data: Buffer; kind?: AssetKind; mimeType?: string;
  source: 'upload' | 'generated' | 'render' | 'procedural';
  providerId?: string | null; modelId?: string | null; prompt?: string | null; meta?: Record<string, unknown>;
}

export async function createAsset(db: DB, input: CreateAssetInput) {
  const sniffed = sniffMime(input.data);
  const mime = sniffed?.mime ?? input.mimeType;
  const kind = input.kind ?? sniffed?.kind;
  if (!mime || !kind) throw badRequest('Unsupported file type');
  const id = crypto.randomUUID();
  const ext = sniffed?.ext ?? (mime === 'application/x-subrip' ? 'srt' : mime === 'text/vtt' ? 'vtt' : 'bin');
  const key = `org/${input.orgId}/assets/${id}/${cleanName(path.parse(input.name).name)}.${ext}`;
  await storage().put(key, input.data, mime);
  const meta = await mediaMeta(key, kind);
  const [row] = await db.insert(assets).values({
    id, orgId: input.orgId, projectId: input.projectId ?? null, brandId: input.brandId ?? null, kind, name: input.name.slice(0, 200), mimeType: mime,
    storageKey: key, sizeBytes: input.data.length, source: input.source, providerId: input.providerId ?? null, modelId: input.modelId ?? null,
    prompt: input.prompt ?? null, meta: input.meta ?? {}, createdBy: input.createdBy ?? null, ...meta,
  }).returning();
  return row;
}

/** Store a file produced on disk (renders) without loading it fully into memory. */
export async function createAssetFromFile(db: DB, input: Omit<CreateAssetInput, 'data'> & { filePath: string; mimeType: string; kind: AssetKind }) {
  const id = crypto.randomUUID();
  const ext = path.extname(input.filePath).slice(1) || 'bin';
  const key = `org/${input.orgId}/assets/${id}/${cleanName(path.parse(input.name).name)}.${ext}`;
  await storage().putFile(key, input.filePath, input.mimeType);
  const size = fs.statSync(input.filePath).size;
  const meta = await mediaMeta(key, input.kind === 'render' ? 'video' : input.kind);
  const [row] = await db.insert(assets).values({
    id, orgId: input.orgId, projectId: input.projectId ?? null, kind: input.kind, name: input.name.slice(0, 200), mimeType: input.mimeType,
    storageKey: key, sizeBytes: size, source: input.source, providerId: input.providerId ?? null, modelId: input.modelId ?? null,
    prompt: input.prompt ?? null, meta: input.meta ?? {}, createdBy: input.createdBy ?? null, ...meta,
  }).returning();
  return row;
}

async function mediaMeta(key: string, kind: string): Promise<{ width?: number; height?: number; durationMs?: number }> {
  try {
    const p = await storage().localPath(key);
    if (kind === 'video' || kind === 'audio') {
      const info = await probe(p);
      return { width: info.width ?? undefined, height: info.height ?? undefined, durationMs: info.durationMs ?? undefined };
    }
    if (kind === 'image' || kind === 'thumbnail') {
      const { loadImage } = await import('@napi-rs/canvas');
      const img = await loadImage(await fs.promises.readFile(p));
      return { width: img.width, height: img.height };
    }
  } catch { /* metadata is best-effort */ }
  return {};
}

export async function uploadAsset(db: DB, actor: Actor, file: { name: string; data: Buffer }, opts: { projectId?: string | null; brandId?: string | null } = {}) {
  assertCan(actor, 'asset.write');
  if (file.data.length === 0) throw badRequest('Empty file');
  if (file.data.length > MAX_UPLOAD_BYTES) throw badRequest(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit`);
  if (!sniffMime(file.data)) throw badRequest('Unsupported or unrecognized file type (allowed: PNG, JPEG, GIF, WebP, MP4, MOV, WebM, MP3, WAV, M4A, OGG)');
  const row = await createAsset(db, { orgId: actor.orgId, createdBy: actor.userId, name: file.name, data: file.data, source: 'upload', ...opts });
  await audit(db, actor, 'asset.upload', { type: 'asset', id: row.id }, { size: row.sizeBytes, mime: row.mimeType });
  return row;
}

export async function getAsset(db: DB, orgId: string, id: string) {
  const [row] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.orgId, orgId))).limit(1);
  if (!row) throw notFound('Asset');
  return row;
}

export async function listAssets(db: DB, actor: Actor, filter: { projectId?: string; kind?: string } = {}) {
  assertCan(actor, 'asset.read');
  const conds = [eq(assets.orgId, actor.orgId)];
  if (filter.projectId) conds.push(eq(assets.projectId, filter.projectId));
  if (filter.kind) conds.push(eq(assets.kind, filter.kind));
  return db.select().from(assets).where(and(...conds)).orderBy(desc(assets.createdAt)).limit(500);
}

export async function deleteAsset(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'asset.write');
  const a = await getAsset(db, actor.orgId, id);
  await storage().delete(a.storageKey).catch(() => {});
  await db.delete(assets).where(eq(assets.id, a.id));
  await audit(db, actor, 'asset.delete', { type: 'asset', id });
}

/** Resolver used by the renderer: only assets of the same org can be referenced. */
export function assetResolver(db: DB, orgId: string) {
  const cache = new Map<string, { path: string; kind: string } | null>();
  return async (assetId: string) => {
    if (cache.has(assetId)) return cache.get(assetId)!;
    try {
      const a = await getAsset(db, orgId, assetId);
      const r = { path: await storage().localPath(a.storageKey), kind: a.kind };
      cache.set(assetId, r);
      return r;
    } catch { cache.set(assetId, null); return null; }
  };
}

export function tmpFile(ext: string): string {
  return path.join(os.tmpdir(), `cs-${crypto.randomUUID()}.${ext}`);
}
