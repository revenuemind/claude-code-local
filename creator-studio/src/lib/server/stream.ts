/** Streams a stored asset with HTTP Range support (video seeking) and safe headers. */
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { storage } from '../storage';
import type { assets } from '../db/schema';

export async function streamAsset(a: typeof assets.$inferSelect, req: NextRequest): Promise<Response> {
  const size = await storage().size(a.storageKey);
  const download = req.nextUrl.searchParams.get('download') === '1';
  const base: Record<string, string> = {
    'content-type': a.mimeType,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
  };
  const range = req.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    start = Math.max(0, start);
    const s = await storage().stream(a.storageKey, { start, end });
    return new Response(Readable.toWeb(s) as ReadableStream, { status: 206, headers: { ...base, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  const s = await storage().stream(a.storageKey);
  return new Response(Readable.toWeb(s) as ReadableStream, { status: 200, headers: { ...base, 'content-length': String(size) } });
}
