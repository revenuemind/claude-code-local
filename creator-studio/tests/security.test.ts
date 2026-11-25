import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret, hashPassword, verifyPassword, keyHint } from '../src/lib/security/crypto';
import { rateLimit, resetRateLimits } from '../src/lib/security/ratelimit';
import { sniffMime, uploadAsset, getAsset, assetResolver } from '../src/lib/services/assets';
import { safeKey } from '../src/lib/storage';
import { signMediaToken, verifyMediaToken } from '../src/lib/services/publishing';
import { redact } from '../src/lib/providers/http';
import { can } from '../src/lib/auth/rbac';
import { testDb, testActor } from './helpers';
import type { DB } from '../src/lib/db/client';
import type { Actor } from '../src/lib/services/context';
import { login, register, resolveSession, createSession, setMemberRole, addMember, removeMember, listMembers } from '../src/lib/services/auth';
import { createProject, getProject, saveComposition } from '../src/lib/services/projects';
import { createBrand, getBrand } from '../src/lib/services/brands';
import { saveCredential, listCredentials, resolveCredentials } from '../src/lib/services/engines';
import { providerCredentials, users } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createCanvas } from '@napi-rs/canvas';

const PNG = createCanvas(4, 4).toBuffer('image/png');

describe('crypto & primitives', () => {
  it('AES-GCM round-trip and tamper detection', () => {
    const enc = encryptSecret('sk-live-123456789');
    expect(enc).not.toContain('sk-live');
    expect(decryptSecret(enc)).toBe('sk-live-123456789');
    const parts = enc.split('.'); parts[3] = Buffer.from('tampered!').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    expect(keyHint('sk-ant-api03-abcdefXYZ9')).toBe('sk-…XYZ9');
  });
  it('scrypt password hashing', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('rate limiter', () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 1000, 0).ok).toBe(true);
    expect(rateLimit('k', 3, 1000, 10).ok).toBe(false);
    expect(rateLimit('k', 3, 1000, 2000).ok).toBe(true);
  });
  it('upload type sniffing rejects HTML/SVG/scripts; storage keys reject traversal', () => {
    expect(sniffMime(PNG)?.mime).toBe('image/png');
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffMime(Buffer.from('<!doctype html><script>'))).toBeNull();
    expect(() => safeKey('org/../../etc/passwd')).toThrow();
    expect(() => safeKey('/abs')).toThrow();
    expect(safeKey('org/a/assets/b/file.png')).toBe('org/a/assets/b/file.png');
  });
  it('signed media links expire and resist tampering', () => {
    const now = Date.now();
    const tok = signMediaToken('asset-1', 60, now);
    expect(verifyMediaToken(tok, now)).toBe('asset-1');
    expect(verifyMediaToken(tok, now + 61_000)).toBeNull();
    const forged = Buffer.from(Buffer.from(tok, 'base64url').toString().replace('asset-1', 'asset-2')).toString('base64url');
    expect(verifyMediaToken(forged, now)).toBeNull();
  });
  it('redacts secrets from provider error text', () => {
    expect(redact('bad key sk-abcdefghijklmnop and Bearer abcdefghijklmnopqrst')).not.toMatch(/sk-abc|abcdefghijklmnopqrst/);
  });
  it('RBAC matrix', () => {
    expect(can('viewer', 'project.write')).toBe(false);
    expect(can('editor', 'generate')).toBe(true);
    expect(can('editor', 'engine.manage')).toBe(false);
    expect(can('admin', 'billing.manage')).toBe(false);
    expect(can('owner', 'billing.manage')).toBe(true);
  });
});

describe('auth, roles and tenant isolation', () => {
  let db: DB; let close: () => Promise<void>; let a: Actor; let b: Actor;
  beforeAll(async () => { ({ db, close } = await testDb()); a = await testActor(db); b = await testActor(db); });
  afterAll(async () => close());

  it('first user is platform admin; later users are not', () => {
    expect(a.isPlatformAdmin).toBe(true);
    expect(b.isPlatformAdmin).toBe(false);
  });

  it('login with correct/incorrect password; disabled accounts are refused', async () => {
    await register(db, { name: 'Z', email: 'z@example.test', password: 'abcdefghijk1' });
    const ok = await login(db, { email: 'Z@Example.test', password: 'abcdefghijk1' });
    expect((await resolveSession(db, ok.token))?.email).toBe('z@example.test');
    await expect(login(db, { email: 'z@example.test', password: 'nope-nope-nope' })).rejects.toThrow(/Invalid/);
    await expect(register(db, { name: 'Z', email: 'z@example.test', password: 'abcdefghijk1' })).rejects.toThrow(/already exists/);
    await db.update(users).set({ disabled: true }).where(eq(users.email, 'z@example.test'));
    await expect(login(db, { email: 'z@example.test', password: 'abcdefghijk1' })).rejects.toThrow(/disabled/);
    expect(await resolveSession(db, ok.token)).toBeNull();
    expect(await resolveSession(db, 'garbage')).toBeNull();
  });

  it('one organization cannot read another organization’s projects, brands, assets or keys', async () => {
    const p = await createProject(db, a, { name: 'Secret', type: 'short', templateId: 'viral-hook', inputs: {}, settings: { language: 'en', aspect: '9:16', durationSec: 20, platforms: [] } });
    const brand = await createBrand(db, a, { name: 'A brand', colors: { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#000000', text: '#ffffff' }, fonts: { heading: 'Inter', body: 'Inter' } });
    const asset = await uploadAsset(db, a, { name: 'x.png', data: PNG });
    await saveCredential(db, a, { providerId: 'openai', secrets: { apiKey: 'sk-test-aaaaaaaaaaaaaaaa' } });
    await expect(getProject(db, b, p.id)).rejects.toThrow(/not found/);
    await expect(getBrand(db, b.orgId, brand.id)).rejects.toThrow(/not found/);
    await expect(getAsset(db, b.orgId, asset.id)).rejects.toThrow(/not found/);
    expect(await assetResolver(db, b.orgId)(asset.id)).toBeNull();
    expect(await listCredentials(db, b)).toHaveLength(0);
    await expect(resolveCredentials(db, b.orgId, 'openai')).rejects.toThrow(/No credentials/);
    // B cannot smuggle A's asset into its own timeline.
    const pb = await createProject(db, b, { name: 'Mine', type: 'short', templateId: 'viral-hook', inputs: {}, settings: { language: 'en', aspect: '9:16', durationSec: 20, platforms: [] } });
    const comp = structuredClone(pb.composition!);
    comp.tracks[0].clips.push({ id: 'steal', type: 'image', start: 0, duration: 1000, media: { assetId: asset.id }, box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover' });
    await expect(saveComposition(db, b, pb.id, comp, pb.compositionRevision)).rejects.toThrow(/not found/);
    // Keys are never returned and are encrypted at rest.
    const creds = await listCredentials(db, a);
    expect(JSON.stringify(creds)).not.toContain('sk-test');
    const [row] = await db.select().from(providerCredentials).limit(1);
    expect(row.encryptedSecret).not.toContain('sk-test');
    expect((await resolveCredentials(db, a.orgId, 'openai')).credentials.apiKey).toBe('sk-test-aaaaaaaaaaaaaaaa');
  });

  it('viewers cannot write; owners are protected', async () => {
    const viewerUser = await register(db, { name: 'V', email: 'viewer@example.test', password: 'abcdefghijk1' });
    await addMember(db, a, 'viewer@example.test', 'viewer');
    const token = await createSession(db, viewerUser.user.id, a.orgId);
    const viewer = (await resolveSession(db, token))!;
    expect(viewer.role).toBe('viewer');
    await expect(createProject(db, viewer, { name: 'X', type: 'short', templateId: 'viral-hook', inputs: {}, settings: { language: 'en', aspect: '9:16', durationSec: 20, platforms: [] } })).rejects.toThrow(/cannot perform/);
    await expect(saveCredential(db, viewer, { providerId: 'openai', secrets: { apiKey: 'x' } })).rejects.toThrow(/cannot perform/);
    await expect(setMemberRole(db, a, a.userId, 'viewer')).rejects.toThrow(/at least one owner/);
    await expect(removeMember(db, a, a.userId)).rejects.toThrow(/last owner/);
    expect((await listMembers(db, a.orgId)).length).toBe(2);
  });

  it('plan limits are enforced from data (free plan: 5 projects)', async () => {
    const c = await testActor(db);
    for (let i = 0; i < 5; i++) await createProject(db, c, { name: `P${i}`, type: 'short', templateId: 'did-you-know', inputs: {}, settings: { language: 'en', aspect: '9:16', durationSec: 15, platforms: [] } });
    await expect(createProject(db, c, { name: 'P6', type: 'short', templateId: 'did-you-know', inputs: {}, settings: { language: 'en', aspect: '9:16', durationSec: 15, platforms: [] } })).rejects.toThrow(/allows 5 projects/);
  });
});
