/**
 * End-to-end production pipeline against a real (in-memory) PostgreSQL,
 * real job queue + worker, real Skia rendering and real FFmpeg encoding.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { testDb, testActor } from './helpers';
import type { DB } from '../src/lib/db/client';
import type { Actor } from '../src/lib/services/context';
import { createProject, getProject, approvePlan, saveComposition } from '../src/lib/services/projects';
import { requestRender, requestPlan, requestMusic, requestSceneMedia } from '../src/lib/services/generation';
import { setEnginePrefs } from '../src/lib/services/engines';
import { listJobs } from '../src/lib/jobs/queue';
import { Worker } from '../src/lib/jobs/worker';
import { getAsset } from '../src/lib/services/assets';
import { storage } from '../src/lib/storage';
import { probe } from '../src/lib/media/ffmpeg';
import { usageSummary } from '../src/lib/services/usage';
import { updateClip } from '../src/lib/composition/ops';

let db: DB; let close: () => Promise<void>; let actor: Actor;

beforeAll(async () => { ({ db, close } = await testDb()); actor = await testActor(db); });
afterAll(async () => { await close(); });

describe('end-to-end: template → plan → edit → render (code-only)', () => {
  it('creates a project with an offline plan and a timeline', async () => {
    const p = await createProject(db, actor, {
      name: 'Sleep tips', type: 'short', templateId: 'three-things', productionMode: 'code',
      inputs: { headline: '3 things about *sleep*', items: ['Cool room — 18°C', 'No screens — 60 min before bed', 'Same wake time — even weekends'], cta: 'Follow', handle: '@sleep' },
      settings: { language: 'en', aspect: '9:16', durationSec: 15, platforms: ['tiktok'], voiceover: false },
    });
    expect(p.plan?.scenes.length).toBe(5);
    expect(p.composition?.tracks.length).toBe(8);
    expect(p.status).toBe('planning');
  });

  it('approves, edits the timeline with optimistic concurrency, and renders a valid MP4 with audio', async () => {
    let [p] = await (await import('../src/lib/services/projects')).listProjects(db, actor);
    let full = await getProject(db, actor, p.id);
    full = await approvePlan(db, actor, full.id);
    expect(full.status).toBe('editing');
    // Edit: change the first text clip and save.
    const textClip = full.composition!.tracks.find((t) => t.role === 'text')!.clips[0];
    const edited = updateClip(full.composition!, textClip.id, { text: 'Edited *headline*' } as never);
    const saved = await saveComposition(db, actor, full.id, edited, full.compositionRevision);
    expect(saved.compositionRevision).toBe(full.compositionRevision + 1);
    await expect(saveComposition(db, actor, full.id, edited, full.compositionRevision)).rejects.toThrow(/changed elsewhere/);

    const { render } = await requestRender(db, actor, full.id, { presetId: 'custom', width: 360, height: 640, fps: 24 });
    const worker = new Worker(db, { concurrency: 1 });
    await worker.drain();
    const jobs = await listJobs(db, actor, { projectId: full.id });
    const job = jobs.find((j) => j.type === 'render.video')!;
    expect(job.error ?? '').toBe('');
    expect(job.status).toBe('succeeded');
    const videoId = (job.result as { videoAssetId: string }).videoAssetId;
    const asset = await getAsset(db, actor.orgId, videoId);
    const file = await storage().localPath(asset.storageKey);
    expect(fs.existsSync(file)).toBe(true);
    const info = await probe(file);
    expect(info.width).toBe(360);
    expect(info.height).toBe(640);
    expect(info.hasAudio).toBe(true);
    expect(Math.abs((info.durationMs ?? 0) - full.composition!.durationMs)).toBeLessThan(250);
    p = await getProject(db, actor, full.id);
    expect(p.status).toBe('ready');
    const usage = await usageSummary(db, actor.orgId);
    expect(usage.renderMinutes).toBeGreaterThan(0);
    expect(render.status).toBe('queued');
  });

  it('runs the offline planner and built-in music + procedural image generation as jobs', async () => {
    const p = await createProject(db, actor, {
      name: 'Facts', type: 'faceless', templateId: 'interesting-facts', productionMode: 'hybrid',
      inputs: { topic: 'Space', items: ['Venus day > year', 'Neutron stars spin fast', 'Diamond planet'] },
      settings: { language: 'he', aspect: '9:16', durationSec: 20, platforms: [] },
    });
    await setEnginePrefs(db, actor, { image: { providerId: 'builtin', modelId: 'procedural-still' } });
    await requestPlan(db, actor, p.id, { providerId: 'offline' });
    await requestMusic(db, actor, p.id, {});
    const scene = (await getProject(db, actor, p.id)).plan!.scenes.find((s) => s.mediaKind === 'image')!;
    await requestSceneMedia(db, actor, p.id, 'image', { sceneId: scene.id });
    await new Worker(db, { concurrency: 2 }).drain();
    const jobs = await listJobs(db, actor, { projectId: p.id });
    for (const j of jobs) expect([j.type, j.status, j.error]).toEqual([j.type, 'succeeded', null]);
    const after = await getProject(db, actor, p.id);
    expect(after.plan!.music.assetId).toBeTruthy();
    expect(after.plan!.scenes.find((s) => s.id === scene.id)!.media?.assetId).toBeTruthy();
    const media = after.composition!.tracks.find((t) => t.role === 'media')!.clips.find((c) => c.sceneId === scene.id)!;
    expect('media' in media && media.media.assetId).toBeTruthy();
  });
});
