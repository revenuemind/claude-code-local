/** AI orchestration entry points: validate, estimate cost, check budgets, enqueue jobs. */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { renders } from '../db/schema';
import { enqueue } from '../jobs/queue';
import { getProject } from './projects';
import { getEnginePrefs, resolveCredentials, modelOrDefault } from './engines';
import { assertAiBudget, assertCanRender } from './usage';
import { assertCan, badRequest, notFound, type Actor } from './context';
import { getProvider, estimateCost, findModel } from '../providers/registry';
import type { Capability } from '../providers/types';
import type { ProductionPlan } from '../planning/types';
import { getPreset, nearestAspect } from '../render/presets';
import { getAsset } from './assets';
import { audit } from './audit';

const engineChoice = z.object({ providerId: z.string().max(60).optional(), modelId: z.string().max(120).optional() });

async function pickEngine(db: DB, actor: Actor, cap: Capability, task: 'planner' | 'image' | 'video' | 'tts' | 'music', override?: { providerId?: string; modelId?: string }) {
  const prefs = await getEnginePrefs(db, actor.orgId);
  const pref = prefs[task] as { providerId: string; modelId: string; voiceId?: string } | undefined;
  const providerId = override?.providerId || pref?.providerId || 'builtin';
  if (task === 'planner' && providerId === 'offline') return { providerId, modelId: 'template-planner', platform: false, voiceId: undefined };
  const p = getProvider(providerId);
  if (!p || !p.capabilities.includes(cap)) throw badRequest(`${providerId} cannot do ${cap}`);
  if (p.status === 'manual') throw badRequest(`${p.name} has no supported API. Generate externally and upload the file to the scene.`);
  if (p.status === 'discontinued' || p.status === 'unavailable') throw badRequest(`${p.name}: ${p.statusNote}`);
  const modelId = modelOrDefault(providerId, cap, override?.modelId || (pref?.providerId === providerId ? pref.modelId : undefined));
  // Verify credentials exist *before* queuing so users get immediate feedback.
  const creds = await resolveCredentials(db, actor.orgId, providerId);
  return { providerId, modelId, platform: creds.source === 'platform', voiceId: pref?.voiceId };
}

export async function requestPlan(db: DB, actor: Actor, projectId: string, input: unknown) {
  assertCan(actor, 'generate');
  const p = await getProject(db, actor, projectId);
  const o = engineChoice.parse(input ?? {});
  const eng = await pickEngine(db, actor, 'llm', 'planner', o);
  if (eng.providerId !== 'offline') await assertAiBudget(db, actor.orgId, estimateCost(eng.providerId, eng.modelId, { inputTokens: 8000 }), eng.platform);
  const job = await enqueue(db, { orgId: actor.orgId, projectId: p.id, type: 'plan.generate', payload: { providerId: eng.providerId, modelId: eng.modelId, fallbackOffline: true }, createdBy: actor.userId, providerId: eng.providerId, modelId: eng.modelId, priority: 5 });
  await audit(db, actor, 'generate.plan', { type: 'project', id: p.id }, { provider: eng.providerId });
  return job;
}

const sceneGen = engineChoice.extend({
  sceneId: z.string().max(80),
  prompt: z.string().max(4000).optional(),
  negativePrompt: z.string().max(1000).optional(),
  durationSec: z.number().min(1).max(20).optional(),
  imageAssetId: z.string().max(100).optional(),
  variants: z.number().int().min(1).max(4).default(1),
  assign: z.boolean().default(true),
});

/** Generate media for one scene (image or video), optionally several variants. */
export async function requestSceneMedia(db: DB, actor: Actor, projectId: string, kind: 'image' | 'video', input: unknown) {
  assertCan(actor, 'generate');
  const p = await getProject(db, actor, projectId);
  const o = sceneGen.parse(input);
  const plan = p.plan as ProductionPlan | null;
  const scene = plan?.scenes.find((s) => s.id === o.sceneId);
  if (!scene) throw notFound('Scene');
  if (o.imageAssetId) await getAsset(db, actor.orgId, o.imageAssetId);
  const eng = await pickEngine(db, actor, kind, kind, o);
  const duration = Math.min(o.durationSec ?? scene.durationSec, findModel(eng.providerId, eng.modelId)?.maxDurationSec ?? 10);
  const est = estimateCost(eng.providerId, eng.modelId, kind === 'image' ? { images: o.variants } : { seconds: duration * o.variants });
  await assertAiBudget(db, actor.orgId, est, eng.platform);
  const prompt = o.prompt || scene.visualPrompt || scene.shotDescription;
  if (!prompt.trim()) throw badRequest('This scene has no visual prompt');
  const jobs = [];
  for (let v = 0; v < o.variants; v++) {
    jobs.push(await enqueue(db, {
      orgId: actor.orgId, projectId: p.id, sceneId: scene.id, type: kind === 'image' ? 'asset.image' : 'asset.video',
      payload: { prompt, negativePrompt: o.negativePrompt, providerId: eng.providerId, modelId: eng.modelId, aspect: p.settings.aspect, durationSec: duration, imageAssetId: o.imageAssetId, assign: o.assign && v === 0, variant: v + 1, estimatedCostUsd: est !== null ? est / o.variants : null, platformCredentials: eng.platform },
      createdBy: actor.userId, providerId: eng.providerId, modelId: eng.modelId, maxAttempts: kind === 'video' ? 2 : 3,
    }));
  }
  await audit(db, actor, `generate.${kind}`, { type: 'project', id: p.id }, { scene: scene.id, provider: eng.providerId, variants: o.variants, est });
  return { jobs, estimatedCostUsd: est };
}

/** Generate media for every scene that still needs it (Generation Workspace "Generate all"). */
export async function requestAllMissing(db: DB, actor: Actor, projectId: string) {
  const p = await getProject(db, actor, projectId);
  const plan = p.plan as ProductionPlan;
  const out = [];
  for (const s of plan.scenes) {
    if (s.media || s.mediaKind === 'none') continue;
    if (s.mediaMode === 'ai-image') out.push(await requestSceneMedia(db, actor, projectId, 'image', { sceneId: s.id }));
    else if (s.mediaMode === 'ai-video' || s.mediaMode === 'avatar') out.push(await requestSceneMedia(db, actor, projectId, 'video', { sceneId: s.id }));
  }
  return out;
}

export async function requestVoiceover(db: DB, actor: Actor, projectId: string, input: unknown) {
  assertCan(actor, 'generate');
  const p = await getProject(db, actor, projectId);
  const o = engineChoice.extend({ voiceId: z.string().max(120).optional(), style: z.string().max(300).optional() }).parse(input ?? {});
  const eng = await pickEngine(db, actor, 'tts', 'tts', o);
  const plan = p.plan as ProductionPlan;
  const chars = plan.scenes.reduce((n, s) => n + s.narration.length, 0);
  if (!chars) throw badRequest('The plan has no narration');
  const est = estimateCost(eng.providerId, eng.modelId, { chars, seconds: chars / 15 });
  await assertAiBudget(db, actor.orgId, est, eng.platform);
  return enqueue(db, { orgId: actor.orgId, projectId: p.id, type: 'asset.voice', payload: { providerId: eng.providerId, modelId: eng.modelId, voiceId: o.voiceId ?? eng.voiceId, style: o.style, estimatedCostUsd: est, platformCredentials: eng.platform }, createdBy: actor.userId, providerId: eng.providerId, modelId: eng.modelId });
}

export async function requestMusic(db: DB, actor: Actor, projectId: string, input: unknown) {
  assertCan(actor, 'generate');
  const p = await getProject(db, actor, projectId);
  const o = engineChoice.extend({ prompt: z.string().max(1000).optional() }).parse(input ?? {});
  const eng = await pickEngine(db, actor, 'music', 'music', o);
  const plan = p.plan as ProductionPlan;
  const durationMs = Math.round((p.composition?.durationMs ?? plan.targetDurationSec * 1000) + 1000);
  const prompt = o.prompt || `${plan.music.mood} instrumental background music, ${plan.music.bpm} BPM, ${plan.music.direction}, no vocals`;
  const est = estimateCost(eng.providerId, eng.modelId, { seconds: durationMs / 1000 });
  await assertAiBudget(db, actor.orgId, est, eng.platform);
  return enqueue(db, { orgId: actor.orgId, projectId: p.id, type: 'asset.music', payload: { providerId: eng.providerId, modelId: eng.modelId, prompt, durationMs, estimatedCostUsd: est, platformCredentials: eng.platform }, createdBy: actor.userId, providerId: eng.providerId, modelId: eng.modelId });
}

export const renderRequestSchema = z.object({
  presetId: z.string().max(40).default('preview-720'),
  width: z.number().int().min(128).max(3840).optional(),
  height: z.number().int().min(128).max(3840).optional(),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
});

export async function requestRender(db: DB, actor: Actor, projectId: string, input: unknown) {
  assertCan(actor, 'render');
  const p = await getProject(db, actor, projectId);
  if (!p.composition) throw badRequest('Nothing to render yet');
  const o = renderRequestSchema.parse(input ?? {});
  const preset = getPreset(o.presetId) ?? (o.presetId === 'custom' ? null : getPreset('preview-720')!);
  if (o.presetId === 'custom' && (!o.width || !o.height)) throw badRequest('Custom exports need width and height');
  let width = o.width ?? preset!.width; let height = o.height ?? preset!.height;
  let aspect = o.presetId === 'custom' ? nearestAspect(width, height) : preset!.aspect;
  if (preset?.id === 'preview-720') {
    aspect = p.settings.aspect;
    const c = p.composition; const s = 720 / Math.min(c.width, c.height);
    width = Math.round((c.width * s) / 2) * 2; height = Math.round((c.height * s) / 2) * 2;
  }
  width = Math.round(width / 2) * 2; height = Math.round(height / 2) * 2;
  const seconds = p.composition.durationMs / 1000;
  if (preset?.maxDurationSec && seconds > preset.maxDurationSec) throw badRequest(`${preset.name} allows at most ${preset.maxDurationSec}s; this video is ${Math.round(seconds)}s.`);
  await assertCanRender(db, actor.orgId, seconds, Math.min(width, height));
  const [r] = await db.insert(renders).values({ orgId: actor.orgId, projectId, presetId: o.presetId, width, height, fps: o.fps ?? preset?.fps ?? p.composition.fps, status: 'queued', createdBy: actor.userId }).returning();
  const job = await enqueue(db, { orgId: actor.orgId, projectId, type: 'render.video', payload: { renderId: r.id, aspect, width, height, fps: r.fps, revision: p.compositionRevision }, createdBy: actor.userId, maxAttempts: 2, priority: 3 });
  await db.update(renders).set({ jobId: job.id }).where(eq(renders.id, r.id));
  await audit(db, actor, 'render.request', { type: 'project', id: projectId }, { preset: o.presetId, width, height });
  return { render: { ...r, jobId: job.id }, job };
}

export async function listRenders(db: DB, actor: Actor, projectId: string) {
  await getProject(db, actor, projectId);
  return db.select().from(renders).where(and(eq(renders.projectId, projectId), eq(renders.orgId, actor.orgId))).orderBy(renders.createdAt);
}
