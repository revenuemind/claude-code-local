import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, testActor } from './helpers';
import type { DB } from '../src/lib/db/client';
import type { Actor } from '../src/lib/services/context';
import { jobs } from '../src/lib/db/schema';
import { enqueue, claimNext, fail, complete, cancelJob, retryJob, reapStale, backoffMs, getJob } from '../src/lib/jobs/queue';
import { Worker } from '../src/lib/jobs/worker';
import { createProject, getProject } from '../src/lib/services/projects';
import { requestPlan } from '../src/lib/services/generation';
import { saveCredential, setEnginePrefs } from '../src/lib/services/engines';
import { mergeLlmPlan, planWithLlm, plannerJsonSchema, buildPlannerPrompt } from '../src/lib/planning/llm';
import { draftPlan } from '../src/lib/templates/engine';
import { getBuiltinTemplate } from '../src/lib/templates/library';
import type { LlmAdapter } from '../src/lib/providers/types';

let db: DB; let close: () => Promise<void>; let actor: Actor;
beforeAll(async () => { ({ db, close } = await testDb()); actor = await testActor(db); });
afterAll(async () => close());
afterEach(() => vi.unstubAllGlobals());

describe('job queue', () => {
  it('claims each job exactly once across concurrent workers', async () => {
    for (let i = 0; i < 6; i++) await enqueue(db, { orgId: actor.orgId, type: 'asset.image', payload: { i } });
    const claimed = await Promise.all(Array.from({ length: 10 }, (_, i) => claimNext(db, `w${i}`)));
    const ids = claimed.filter(Boolean).map((j) => j!.id);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) await complete(db, id, {});
  });

  it('retries retryable failures with backoff, fails permanently otherwise', async () => {
    const j = await enqueue(db, { orgId: actor.orgId, type: 'asset.image', payload: {}, maxAttempts: 2 });
    let c = (await claimNext(db, 'w'))!;
    expect(c.id).toBe(j.id);
    expect(await fail(db, c, Object.assign(new Error('timeout'), { retryable: true }))).toBe('retry');
    let row = await getJob(db, actor, j.id);
    expect(row.status).toBe('queued');
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now() + 3000);
    await db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.id, j.id));
    c = (await claimNext(db, 'w'))!;
    expect(c.attempts).toBe(2);
    expect(await fail(db, c, new Error('boom'))).toBe('failed');
    row = await getJob(db, actor, j.id);
    expect(row.status).toBe('failed');
    expect(backoffMs(1)).toBe(5000); expect(backoffMs(20)).toBe(600000);
    const re = await retryJob(db, actor, j.id);
    expect([re.status, re.attempts]).toEqual(['queued', 0]);
    await cancelJob(db, actor, j.id);
    expect((await getJob(db, actor, j.id)).status).toBe('canceled');
  });

  it('re-queues jobs held by a crashed worker', async () => {
    const j = await enqueue(db, { orgId: actor.orgId, type: 'asset.image', payload: {} });
    await claimNext(db, 'dead');
    await db.update(jobs).set({ lockedAt: new Date(Date.now() - 3600_000) }).where(eq(jobs.id, j.id));
    expect(await reapStale(db, 60_000)).toBeGreaterThanOrEqual(1);
    expect((await getJob(db, actor, j.id)).status).toBe('queued');
    await cancelJob(db, actor, j.id);
  });

  it('unknown job types fail without retry', async () => {
    const [j] = await db.insert(jobs).values({ orgId: actor.orgId, type: 'nope', payload: {} }).returning();
    await new Worker(db, { concurrency: 1 }).drain(5);
    const row = await getJob(db, actor, j.id);
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/No handler/);
  });
});

describe('AI production planning', () => {
  const t = getBuiltinTemplate('three-things')!;
  const skeleton = draftPlan(t, t.sample, { language: 'he', mode: 'hybrid', voiceover: true });

  it('prompt carries language, constraints and scene ids; schema is JSON-schema', () => {
    const { system, prompt } = buildPlannerPrompt(skeleton, { template: t, inputs: t.sample, audience: 'students' });
    expect(system).toContain('Hebrew');
    expect(prompt).toContain(skeleton.scenes[0].id);
    expect(prompt).toContain('students');
    const s = plannerJsonSchema();
    expect(s.type).toBe('object');
    expect(s.$schema).toBeUndefined();
  });

  it('merges LLM content into the structural skeleton without breaking it', async () => {
    const llm: LlmAdapter = {
      generate: async () => ({
        text: '', model: 'fake', usage: { inputTokens: 100, outputTokens: 50 },
        json: { title: 'כותרת', concept: 'c', hook: 'h', visualDirection: 'v', musicDirection: 'm', rationale: ['why'],
          scenes: [{ id: skeleton.scenes[0].id, headline: 'פתיח *חזק*', narration: 'קריינות', shotDescription: 's', visualPrompt: 'a calm lake', durationSec: 3 }, { id: 'unknown-id', headline: 'ignored', narration: 'x', shotDescription: '', visualPrompt: '' }] },
      }),
    };
    const { plan, usage } = await planWithLlm(skeleton, { template: t, inputs: t.sample }, llm, 'fake', 'anthropic', { credentials: {} });
    expect(plan.scenes.length).toBe(skeleton.scenes.length);
    expect(plan.scenes[0]).toMatchObject({ headline: 'פתיח *חזק*', narration: 'קריינות', visualPrompt: 'a calm lake', durationSec: 3, layout: skeleton.scenes[0].layout, mediaMode: skeleton.scenes[0].mediaMode });
    expect(plan.scenes[1].headline).toBe(skeleton.scenes[1].headline);
    expect(plan.generatedBy).toBe('anthropic:fake');
    expect(plan.rationale[0]).toBe('why');
    expect(usage.inputTokens).toBe(100);
    expect(mergeLlmPlan(skeleton, { title: '', concept: '', hook: '', visualDirection: '', musicDirection: '', rationale: [], scenes: [] }, 'x').scenes).toEqual(skeleton.scenes);
  });

  it('rejects malformed LLM output', async () => {
    const llm: LlmAdapter = { generate: async () => ({ text: 'not json', model: 'm', usage: { inputTokens: 0, outputTokens: 0 } }) };
    await expect(planWithLlm(skeleton, { template: t, inputs: {} }, llm, 'm', 'x', { credentials: {} })).rejects.toThrow(/invalid JSON/);
  });

  it('a failing AI planner falls back to the offline planner and records why', async () => {
    const p = await createProject(db, actor, { name: 'Plan', type: 'short', templateId: 'three-things', productionMode: 'hybrid', inputs: t.sample, settings: { language: 'en', aspect: '9:16', durationSec: 24, platforms: [] } });
    await saveCredential(db, actor, { providerId: 'anthropic', secrets: { apiKey: 'sk-ant-fake-key-123456' } });
    await setEnginePrefs(db, actor, { planner: { providerId: 'anthropic', modelId: 'claude-opus-5-5' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } })));
    const job = await requestPlan(db, actor, p.id, {});
    await new Worker(db, { concurrency: 1 }).drain(5);
    const done = await getJob(db, actor, job.id);
    expect(done.status).toBe('succeeded');
    expect(done.result).toMatchObject({ source: 'offline-fallback' });
    const after = await getProject(db, actor, p.id);
    expect(after.plan!.rationale[0]).toMatch(/AI planner \(anthropic\) failed/);
    expect(after.planSource).toBe('offline');
  });
});
