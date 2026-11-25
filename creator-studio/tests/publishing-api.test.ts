import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { testDb, testActor } from './helpers';
import type { DB } from '../src/lib/db/client';
import type { Actor } from '../src/lib/services/context';
import { setDbHandleForTests } from '../src/lib/db/client';
import { createSession, SESSION_COOKIE } from '../src/lib/services/auth';
import { generateCaption, chaptersFromPlan, extractHashtags } from '../src/lib/publishing/captions';
import { youtube, tiktok } from '../src/lib/publishing/adapters';
import { draftPlan } from '../src/lib/templates/engine';
import { getBuiltinTemplate } from '../src/lib/templates/library';
import { createProject, approvePlan } from '../src/lib/services/projects';
import { requestRender } from '../src/lib/services/generation';
import { createPublication, listPublications } from '../src/lib/services/publishing';
import { Worker } from '../src/lib/jobs/worker';
import { renders } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

let db: DB; let close: () => Promise<void>; let actor: Actor; let token: string;
beforeAll(async () => {
  ({ db, close } = await testDb());
  actor = await testActor(db);
  token = await createSession(db, actor.userId, actor.orgId);
  setDbHandleForTests(Promise.resolve({ db, kind: 'pglite', close: async () => {} }));
});
afterAll(async () => { setDbHandleForTests(undefined); await close(); });
afterEach(() => vi.unstubAllGlobals());

describe('captions & hashtags', () => {
  const t = getBuiltinTemplate('documentary')!;
  const plan = draftPlan(t, t.sample, { language: 'en', mode: 'code', voiceover: true });
  it('respects platform limits and produces hashtags and YouTube chapters', () => {
    const yt = generateCaption(plan, 'youtube', { templateTags: t.tags });
    expect(yt.title.length).toBeLessThanOrEqual(100);
    expect(yt.caption).toContain('0:00');
    const tk = generateCaption(plan, 'tiktok', { templateTags: t.tags });
    expect(tk.title).toBe('');
    expect(tk.hashtags.length).toBeLessThanOrEqual(8);
    expect(tk.hashtags.every((h) => h.startsWith('#') && !h.includes(' '))).toBe(true);
    expect(chaptersFromPlan(plan)[0]).toMatch(/^0:00 /);
    expect(extractHashtags(['קפה טוב קפה'], [], 3)).toContain('#קפה');
  });
});

describe('publishing adapters (simulated platform APIs)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const video = path.join(dir, 'v.mp4');
  fs.writeFileSync(video, Buffer.alloc(1024, 1));
  const base = { videoPath: video, title: 'T', caption: 'C', hashtags: ['#a'], privacy: 'public' as const, account: { externalId: 'x', tokens: { accessToken: 'at' } } };

  it('YouTube resumable upload: init → PUT bytes → video id', async () => {
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url.split('?')[0]}`);
      if (url.includes('uploadType=resumable')) return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
      return new Response(JSON.stringify({ id: 'vid123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const r = await youtube.publish(base, { fetch: f });
    expect(r).toMatchObject({ status: 'published', externalPostId: 'vid123', externalUrl: 'https://www.youtube.com/watch?v=vid123' });
    expect(calls).toEqual(['POST https://www.googleapis.com/upload/youtube/v3/videos', 'PUT https://upload.example/session1']);
  });

  it('TikTok posts privately (SELF_ONLY) unless the app is audited', async () => {
    let initBody: { post_info: { privacy_level: string } } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      if (url.includes('/init/')) { initBody = JSON.parse(String(init.body)); return new Response(JSON.stringify({ data: { publish_id: 'p1', upload_url: 'https://up/1' }, error: { code: 'ok' } }), { headers: { 'content-type': 'application/json' } }); }
      return new Response('', { status: 201 });
    }) as unknown as typeof fetch;
    const r = await tiktok.publish(base, { fetch: f });
    expect(initBody!.post_info.privacy_level).toBe('SELF_ONLY');
    expect(r.note).toMatch(/private/);
  });
});

describe('publishing workflow (manual) and API layer', () => {
  it('render → manual publication → ready-for-manual', async () => {
    const p = await createProject(db, actor, { name: 'Pub', type: 'short', templateId: 'did-you-know', inputs: getBuiltinTemplate('did-you-know')!.sample, settings: { language: 'en', aspect: '9:16', durationSec: 10, platforms: [] } });
    await approvePlan(db, actor, p.id);
    const { render } = await requestRender(db, actor, p.id, { presetId: 'custom', width: 180, height: 320, fps: 24 });
    await expect(createPublication(db, actor, { projectId: p.id, renderId: render.id, platform: 'manual' }, { submit: true })).rejects.toThrow(/not finished/);
    await new Worker(db, { concurrency: 1 }).drain();
    const [r] = await db.select().from(renders).where(eq(renders.id, render.id));
    expect(r.status).toBe('succeeded');
    const pub = await createPublication(db, actor, { projectId: p.id, renderId: render.id, platform: 'manual', caption: 'hello' }, { submit: true });
    expect(pub.status).toBe('queued');
    await expect(createPublication(db, actor, { projectId: p.id, renderId: render.id, platform: 'youtube' }, { submit: true })).rejects.toThrow(/connected account/);
    await new Worker(db, { concurrency: 1 }).drain();
    expect((await listPublications(db, actor, p.id))[0].status).toBe('ready-for-manual');
  });

  it('API: auth required, CSRF origin check, validation errors, JSON handling', async () => {
    const projects = await import('../src/app/api/projects/route');
    const health = await import('../src/app/api/health/route');
    const rc = { params: Promise.resolve({}) };
    const req = (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => new NextRequest(new URL(url, 'http://studio.test'), { method: init.method ?? 'GET', body: init.body, headers: { host: 'studio.test', ...(init.headers ?? {}) } });
    expect((await health.GET(req('/api/health'), rc)).status).toBe(200);
    expect((await projects.GET(req('/api/projects'), rc)).status).toBe(401);
    const authed = { cookie: `${SESSION_COOKIE}=${token}` };
    const list = await projects.GET(req('/api/projects', { headers: authed }), rc);
    expect(list.status).toBe(200);
    expect(Array.isArray((await list.json()).projects)).toBe(true);
    const cross = await projects.POST(req('/api/projects', { method: 'POST', body: '{}', headers: { ...authed, origin: 'https://evil.example', 'content-type': 'application/json' } }), rc);
    expect(cross.status).toBe(403);
    const invalid = await projects.POST(req('/api/projects', { method: 'POST', body: JSON.stringify({ name: '' }), headers: { ...authed, origin: 'http://studio.test', 'content-type': 'application/json' } }), rc);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe('validation');
    const malformed = await projects.POST(req('/api/projects', { method: 'POST', body: '{bad', headers: { ...authed, origin: 'http://studio.test', 'content-type': 'application/json' } }), rc);
    expect(malformed.status).toBe(400);
  });
});
