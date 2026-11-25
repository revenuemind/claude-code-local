/** Social accounts, publications (drafts, scheduling, queue, history) and signed media links. */
import { and, desc, eq, lt } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db/client';
import { socialAccounts, publications, renders, oauthStates, projects } from '../db/schema';
import { encryptSecret, decryptSecret, randomToken } from '../security/crypto';
import { assertCan, badRequest, notFound, type Actor } from './context';
import { audit } from './audit';
import { enqueue } from '../jobs/queue';
import { generateCaption, type PublishPlatform } from '../publishing/captions';
import { authorizationUrl, exchangeCode, oauthConfigured, pkce, type OAuthPlatform } from '../publishing/oauth';
import type { ProductionPlan } from '../planning/types';
import { getTemplate } from './templates';

export const PLATFORMS: PublishPlatform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'blotato', 'manual'];

export async function listAccounts(db: DB, actor: Actor) {
  assertCan(actor, 'project.read');
  const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.orgId, actor.orgId)).orderBy(desc(socialAccounts.createdAt));
  return rows.map(({ encryptedTokens: _t, ...r }) => r);
}

export async function connectAccountManually(db: DB, actor: Actor, input: unknown) {
  assertCan(actor, 'publish.accounts');
  const data = z.object({
    platform: z.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'blotato']),
    displayName: z.string().trim().min(1).max(100),
    externalId: z.string().max(200).nullable().optional(),
    tokens: z.record(z.string().max(40), z.string().max(4000)),
    brandId: z.string().max(100).nullable().optional(),
  }).parse(input);
  const [row] = await db.insert(socialAccounts).values({
    orgId: actor.orgId, brandId: data.brandId ?? null, platform: data.platform, displayName: data.displayName, externalId: data.externalId ?? null,
    encryptedTokens: encryptSecret(JSON.stringify(data.tokens)), status: 'connected',
  }).returning();
  await audit(db, actor, 'social.connect', { type: 'social_account', id: row.id }, { platform: data.platform, method: 'manual' });
  const { encryptedTokens: _t, ...safe } = row;
  return safe;
}

export async function startOAuth(db: DB, actor: Actor, platform: OAuthPlatform) {
  assertCan(actor, 'publish.accounts');
  if (!oauthConfigured(platform)) throw badRequest(`${platform} OAuth is not configured on this server (see docs/ENVIRONMENT.md).`);
  const state = randomToken(24);
  const { verifier, challenge } = pkce();
  await db.insert(oauthStates).values({ state, orgId: actor.orgId, userId: actor.userId, platform, codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return authorizationUrl(platform, state, challenge);
}

export async function finishOAuth(db: DB, platform: OAuthPlatform, state: string, code: string) {
  const [st] = await db.select().from(oauthStates).where(eq(oauthStates.state, state)).limit(1);
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  if (!st || st.platform !== platform || st.expiresAt < new Date()) throw badRequest('OAuth state is invalid or expired; please try connecting again.');
  const accounts = await exchangeCode(platform, code, st.codeVerifier ?? '');
  for (const a of accounts) {
    await db.insert(socialAccounts).values({ orgId: st.orgId, platform, displayName: a.displayName, externalId: a.externalId, encryptedTokens: encryptSecret(JSON.stringify(a.tokens)), scopes: a.scopes, expiresAt: a.expiresAt, status: 'connected' });
  }
  await audit(db, { orgId: st.orgId, userId: st.userId, ip: null }, 'social.connect', undefined, { platform, method: 'oauth', accounts: accounts.length });
  return accounts.length;
}

export async function disconnectAccount(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'publish.accounts');
  await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, actor.orgId)));
  await audit(db, actor, 'social.disconnect', { type: 'social_account', id });
}

export async function accountTokens(db: DB, orgId: string, id: string) {
  const [a] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, orgId))).limit(1);
  if (!a) throw notFound('Social account');
  return { account: a, tokens: a.encryptedTokens ? (JSON.parse(decryptSecret(a.encryptedTokens)) as Record<string, string>) : {} };
}

// ───────────────────────── Publications ─────────────────────────

export const publicationSchema = z.object({
  projectId: z.string().max(100),
  renderId: z.string().max(100),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'blotato', 'manual']),
  socialAccountId: z.string().max(100).nullable().optional(),
  title: z.string().max(255).default(''),
  caption: z.string().max(5000).default(''),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  privacy: z.enum(['public', 'private', 'unlisted']).default('private'),
  thumbnailAssetId: z.string().max(100).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export async function suggestCaption(db: DB, actor: Actor, projectId: string, platform: PublishPlatform) {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, actor.orgId))).limit(1);
  if (!p?.plan) throw notFound('Project');
  const t = p.templateId ? await getTemplate(db, actor.orgId, p.templateId).catch(() => null) : null;
  return generateCaption(p.plan as ProductionPlan, platform, { templateTags: t?.tags ?? [], handle: (p.inputs as Record<string, string>).handle });
}

export async function createPublication(db: DB, actor: Actor, input: unknown, opts: { submit: boolean }) {
  assertCan(actor, 'publish');
  const data = publicationSchema.parse(input);
  const [r] = await db.select().from(renders).where(and(eq(renders.id, data.renderId), eq(renders.orgId, actor.orgId))).limit(1);
  if (!r || r.projectId !== data.projectId) throw notFound('Render');
  if (r.status !== 'succeeded') throw badRequest('The render has not finished yet');
  if (data.platform !== 'manual') {
    if (!data.socialAccountId) throw badRequest('Choose a connected account');
    const { account } = await accountTokens(db, actor.orgId, data.socialAccountId);
    if (account.platform !== data.platform) throw badRequest('Account does not belong to this platform');
  }
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) throw badRequest('Scheduled time is in the past');
  const [pub] = await db.insert(publications).values({
    orgId: actor.orgId, projectId: data.projectId, renderId: r.id, socialAccountId: data.socialAccountId ?? null, platform: data.platform,
    title: data.title, caption: data.caption, hashtags: data.hashtags, privacy: data.privacy, thumbnailAssetId: data.thumbnailAssetId ?? r.thumbnailAssetId,
    scheduledAt, status: opts.submit ? (scheduledAt ? 'scheduled' : 'queued') : 'draft', createdBy: actor.userId,
  }).returning();
  if (opts.submit) await submitPublication(db, actor, pub.id);
  await audit(db, actor, 'publication.create', { type: 'publication', id: pub.id }, { platform: data.platform, scheduled: !!scheduledAt });
  return getPublication(db, actor, pub.id);
}

export async function submitPublication(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'publish');
  const pub = await getPublication(db, actor, id);
  if (!['draft', 'failed', 'queued', 'scheduled'].includes(pub.status)) throw badRequest(`Publication is ${pub.status}`);
  const job = await enqueue(db, {
    orgId: actor.orgId, projectId: pub.projectId, type: 'publish.post', payload: { publicationId: pub.id }, createdBy: actor.userId,
    runAt: pub.scheduledAt && pub.scheduledAt > new Date() ? pub.scheduledAt : new Date(), maxAttempts: 3,
  });
  await db.update(publications).set({ jobId: job.id, status: pub.scheduledAt && pub.scheduledAt > new Date() ? 'scheduled' : 'queued', error: null, updatedAt: new Date() }).where(eq(publications.id, id));
  return job;
}

export async function getPublication(db: DB, actor: Actor, id: string) {
  const [p] = await db.select().from(publications).where(and(eq(publications.id, id), eq(publications.orgId, actor.orgId))).limit(1);
  if (!p) throw notFound('Publication');
  return p;
}

export async function listPublications(db: DB, actor: Actor, projectId?: string) {
  assertCan(actor, 'project.read');
  const conds = [eq(publications.orgId, actor.orgId)];
  if (projectId) conds.push(eq(publications.projectId, projectId));
  return db.select().from(publications).where(and(...conds)).orderBy(desc(publications.createdAt)).limit(300);
}

export async function cancelPublication(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'publish');
  const p = await getPublication(db, actor, id);
  if (!['draft', 'scheduled', 'queued', 'failed'].includes(p.status)) throw badRequest(`Cannot cancel a ${p.status} publication`);
  await db.update(publications).set({ status: 'canceled', updatedAt: new Date() }).where(eq(publications.id, id));
  if (p.jobId) {
    const { jobs } = await import('../db/schema');
    await db.update(jobs).set({ status: 'canceled', finishedAt: new Date() }).where(and(eq(jobs.id, p.jobId), eq(jobs.status, 'queued')));
  }
}

// ───────────────────────── Signed, expiring public media links ─────────────────────────

function mediaSecret(): Buffer {
  return createHmac('sha256', process.env.APP_ENCRYPTION_KEY || 'dev-only').update('signed-media-v1').digest();
}

export function signMediaToken(assetId: string, ttlSec = 3600, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSec;
  const sig = createHmac('sha256', mediaSecret()).update(`${assetId}.${exp}`).digest('base64url');
  return Buffer.from(`${assetId}.${exp}.${sig}`).toString('base64url');
}

export function verifyMediaToken(token: string, now = Date.now()): string | null {
  let raw: string;
  try { raw = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }
  const [assetId, expS, sig] = raw.split('.');
  if (!assetId || !expS || !sig) return null;
  if (Number(expS) * 1000 < now) return null;
  const expected = createHmac('sha256', mediaSecret()).update(`${assetId}.${expS}`).digest();
  const given = Buffer.from(sig, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected) ? assetId : null;
}

export function publicMediaUrl(assetId: string, ttlSec = 3600): string | null {
  const base = process.env.APP_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/public/media/${signMediaToken(assetId, ttlSec)}`;
}
