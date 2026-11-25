import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { brands } from '../db/schema';
import { assertCan, notFound, type Actor } from './context';
import { audit } from './audit';
import { FONT_FAMILIES } from '../render/fonts';
import type { BrandKit } from '../brand/types';
import { getAsset } from './assets';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB color');

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  workspaceId: z.string().max(100).nullable().optional(),
  logoAssetId: z.string().max(100).nullable().optional(),
  colors: z.object({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }),
  fonts: z.object({ heading: z.enum(FONT_FAMILIES as [string, ...string[]]), body: z.enum(FONT_FAMILIES as [string, ...string[]]) }),
  voice: z.string().max(2000).nullable().optional(),
  preferredLanguages: z.array(z.string().max(10)).max(12).optional(),
  socialAccounts: z.record(z.string().max(30), z.string().max(200)).optional(),
  referenceAssetIds: z.array(z.string().max(100)).max(50).optional(),
  guidelines: z.string().max(10_000).nullable().optional(),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

export async function listBrands(db: DB, actor: Actor) {
  assertCan(actor, 'brand.read');
  return db.select().from(brands).where(eq(brands.orgId, actor.orgId)).orderBy(desc(brands.updatedAt));
}

export async function getBrand(db: DB, orgId: string, id: string) {
  const [b] = await db.select().from(brands).where(and(eq(brands.id, id), eq(brands.orgId, orgId))).limit(1);
  if (!b) throw notFound('Brand');
  return b;
}

async function checkAssets(db: DB, orgId: string, data: Partial<BrandInput>) {
  if (data.logoAssetId) await getAsset(db, orgId, data.logoAssetId);
  for (const id of data.referenceAssetIds ?? []) await getAsset(db, orgId, id);
}

export async function createBrand(db: DB, actor: Actor, input: unknown) {
  assertCan(actor, 'brand.write');
  const data = brandInputSchema.parse(input);
  await checkAssets(db, actor.orgId, data);
  const [b] = await db.insert(brands).values({ ...data, orgId: actor.orgId }).returning();
  await audit(db, actor, 'brand.create', { type: 'brand', id: b.id });
  return b;
}

export async function updateBrand(db: DB, actor: Actor, id: string, input: unknown) {
  assertCan(actor, 'brand.write');
  await getBrand(db, actor.orgId, id);
  const data = brandInputSchema.partial().parse(input);
  await checkAssets(db, actor.orgId, data);
  const [b] = await db.update(brands).set({ ...data, updatedAt: new Date() }).where(and(eq(brands.id, id), eq(brands.orgId, actor.orgId))).returning();
  await audit(db, actor, 'brand.update', { type: 'brand', id });
  return b;
}

export async function deleteBrand(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'brand.write');
  await getBrand(db, actor.orgId, id);
  await db.delete(brands).where(and(eq(brands.id, id), eq(brands.orgId, actor.orgId)));
  await audit(db, actor, 'brand.delete', { type: 'brand', id });
}

export function toBrandKit(b: typeof brands.$inferSelect): BrandKit {
  return { name: b.name, colors: b.colors, fonts: b.fonts, logoAssetId: b.logoAssetId, handle: Object.values(b.socialAccounts ?? {})[0] ?? null };
}
