/** AI Engine Manager: per-org encrypted credentials and per-task engine preferences. */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { providerCredentials, enginePreferences } from '../db/schema';
import { encryptSecret, decryptSecret, keyHint } from '../security/crypto';
import { getProvider, defaultModel } from '../providers/registry';
import type { Capability, Credentials, EnginePreferences } from '../providers/types';
import { assertCan, badRequest, notFound, type Actor } from './context';
import { audit } from './audit';

export async function listCredentials(db: DB, actor: Actor) {
  assertCan(actor, 'engine.read');
  const rows = await db.select().from(providerCredentials).where(eq(providerCredentials.orgId, actor.orgId));
  // Never return secrets — only a hint.
  return rows.map(({ encryptedSecret: _s, ...r }) => r);
}

export const credentialInputSchema = z.object({
  providerId: z.string().max(60),
  label: z.string().trim().min(1).max(60).default('default'),
  secrets: z.record(z.string().max(40), z.string().max(4000)),
  config: z.record(z.string().max(40), z.string().max(500)).optional(),
});

export async function saveCredential(db: DB, actor: Actor, input: unknown) {
  assertCan(actor, 'engine.manage');
  const data = credentialInputSchema.parse(input);
  const p = getProvider(data.providerId);
  if (!p || p.credentialFields.length === 0) throw badRequest('This provider does not take credentials');
  const allowed = new Set(p.credentialFields.map((f) => f.key));
  const secrets = Object.fromEntries(Object.entries(data.secrets).filter(([k, v]) => allowed.has(k) && v.trim()).map(([k, v]) => [k, v.trim()]));
  if (!p.credentialFields.some((f) => !f.optional && secrets[f.key]) && !Object.keys(secrets).length) throw badRequest('Provide at least one credential value');
  const primary = secrets.apiKey ?? Object.values(secrets)[0];
  const values = { orgId: actor.orgId, providerId: p.id, label: data.label, encryptedSecret: encryptSecret(JSON.stringify(secrets)), keyHint: keyHint(primary), config: data.config ?? {}, createdBy: actor.userId };
  const [row] = await db.insert(providerCredentials).values(values)
    .onConflictDoUpdate({ target: [providerCredentials.orgId, providerCredentials.providerId, providerCredentials.label], set: { encryptedSecret: values.encryptedSecret, keyHint: values.keyHint, config: values.config } })
    .returning();
  await audit(db, actor, 'engine.credential.save', { type: 'provider', id: p.id }, { label: data.label });
  const { encryptedSecret: _s, ...safe } = row;
  return safe;
}

export async function deleteCredential(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'engine.manage');
  const [row] = await db.select().from(providerCredentials).where(and(eq(providerCredentials.id, id), eq(providerCredentials.orgId, actor.orgId))).limit(1);
  if (!row) throw notFound('Credential');
  await db.delete(providerCredentials).where(eq(providerCredentials.id, id));
  await audit(db, actor, 'engine.credential.delete', { type: 'provider', id: row.providerId });
}

export interface ResolvedCredentials { credentials: Credentials; config: Record<string, string>; source: 'org' | 'platform' | 'none' }

/** Server-side only. Org keys take precedence; platform-managed keys are used only when the org opted in. */
export async function resolveCredentials(db: DB, orgId: string, providerId: string): Promise<ResolvedCredentials> {
  const p = getProvider(providerId);
  if (!p) throw badRequest(`Unknown provider ${providerId}`);
  if (p.credentialFields.length === 0) return { credentials: {}, config: {}, source: 'none' };
  const [row] = await db.select().from(providerCredentials).where(and(eq(providerCredentials.orgId, orgId), eq(providerCredentials.providerId, providerId))).limit(1);
  if (row) {
    await db.update(providerCredentials).set({ lastUsedAt: new Date() }).where(eq(providerCredentials.id, row.id));
    return { credentials: JSON.parse(decryptSecret(row.encryptedSecret)) as Credentials, config: row.config, source: 'org' };
  }
  const prefs = await getEnginePrefs(db, orgId);
  const envKey = p.platformEnvKey ? process.env[p.platformEnvKey] : undefined;
  if (prefs.allowPlatformCredentials && envKey) return { credentials: { apiKey: envKey }, config: {}, source: 'platform' };
  throw badRequest(`No credentials connected for ${p.name}. Add an API key in the AI Engine Manager${p.platformEnvKey ? ' or enable platform-managed credentials' : ''}.`);
}

export const DEFAULT_PREFS: EnginePreferences = {
  planner: { providerId: 'offline', modelId: 'template-planner' },
  image: { providerId: 'builtin', modelId: 'procedural-still' },
  video: { providerId: 'gemini', modelId: 'veo-3.1-fast-generate-preview' },
  tts: { providerId: 'elevenlabs', modelId: 'eleven_multilingual_v2' },
  music: { providerId: 'builtin', modelId: 'procedural-music' },
  quality: 'standard',
  allowPlatformCredentials: false,
};

export async function getEnginePrefs(db: DB, orgId: string): Promise<EnginePreferences> {
  const [row] = await db.select().from(enginePreferences).where(eq(enginePreferences.orgId, orgId)).limit(1);
  return { ...DEFAULT_PREFS, ...(row?.prefs ?? {}) };
}

const choice = z.object({ providerId: z.string().max(60), modelId: z.string().trim().min(1).max(120), voiceId: z.string().max(120).optional() });
const prefsSchema = z.object({
  planner: choice.optional(), image: choice.optional(), video: choice.optional(), tts: choice.optional(), music: choice.optional(),
  quality: z.enum(['draft', 'standard', 'high']).optional(), allowPlatformCredentials: z.boolean().optional(),
});

export async function setEnginePrefs(db: DB, actor: Actor, input: unknown) {
  assertCan(actor, 'engine.manage');
  const data = prefsSchema.parse(input);
  const caps: Record<string, Capability> = { planner: 'llm', image: 'image', video: 'video', tts: 'tts', music: 'music' };
  for (const [task, cap] of Object.entries(caps)) {
    const c = (data as Record<string, unknown>)[task] as { providerId: string } | undefined;
    if (!c) continue;
    if (task === 'planner' && c.providerId === 'offline') continue;
    const p = getProvider(c.providerId);
    if (!p || !p.capabilities.includes(cap)) throw badRequest(`${c.providerId} cannot be used for ${task}`);
    if (p.status !== 'builtin' && p.status !== 'implemented') throw badRequest(`${p.name} is ${p.status} and cannot be selected`);
  }
  const merged = { ...(await getEnginePrefs(db, actor.orgId)), ...data };
  await db.insert(enginePreferences).values({ orgId: actor.orgId, prefs: merged })
    .onConflictDoUpdate({ target: enginePreferences.orgId, set: { prefs: merged, updatedAt: new Date() } });
  await audit(db, actor, 'engine.prefs', undefined, { tasks: Object.keys(data) });
  return merged;
}

export function modelOrDefault(providerId: string, cap: Capability, modelId?: string): string {
  return modelId || defaultModel(providerId, cap)?.id || '';
}
