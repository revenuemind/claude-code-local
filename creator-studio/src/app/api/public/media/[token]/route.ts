import { api } from '@/lib/server/api';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyMediaToken } from '@/lib/services/publishing';
import { assets } from '@/lib/db/schema';
import { streamAsset } from '@/lib/server/stream';

export const GET = api<{ token: string }>(async ({ db, params, req }) => {
  const id = verifyMediaToken(params.token);
  if (!id) return NextResponse.json({ error: { code: 'expired', message: 'Link invalid or expired' } }, { status: 403 });
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return NextResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  return streamAsset(a, req);
}, { auth: false });
