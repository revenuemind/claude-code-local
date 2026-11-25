/** Job handlers: plan generation, image/video/voice/music generation, rendering, publishing. */
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { projects, renders, publications, socialAccounts } from '../db/schema';
import type { JobRow } from './queue';
import type { Actor } from '../services/context';
import { getProject, savePlan, assignSceneMedia, compositionFor, rebuildComposition } from '../services/projects';
import { getTemplate } from '../services/templates';
import { getBrand } from '../services/brands';
import { resolveCredentials } from '../services/engines';
import { createAsset, createAssetFromFile, assetResolver, getAsset, tmpFile } from '../services/assets';
import { recordUsage, getOrgPlan } from '../services/usage';
import { accountTokens, publicMediaUrl } from '../services/publishing';
import { getAdapters, estimateCost } from '../providers/registry';
import { ProviderError } from '../providers/types';
import { draftPlan, estimateWordTimings } from '../templates/engine';
import { planWithLlm } from '../planning/llm';
import type { ProductionMode, ProductionPlan } from '../planning/types';
import { exportVideo, renderStill, thumbnailTime, toSrt, toVtt } from '../render/node';
import { probe } from '../media/ffmpeg';
import { storage } from '../storage';
import { PUBLISHERS } from '../publishing/adapters';
import { refreshTokens, type OAuthPlatform } from '../publishing/oauth';
import { encryptSecret } from '../security/crypto';
import type { Aspect } from '../templates/types';
import type { Composition } from '../composition/types';

export interface JobContext {
  db: DB;
  job: JobRow;
  signal: AbortSignal;
  progress: (p: number, result?: Record<string, unknown>) => Promise<void>;
  log: (msg: string) => void;
}

type Handler = (ctx: JobContext) => Promise<Record<string, unknown>>;

/** Jobs run with the permissions checked at enqueue time, scoped to the job's org. */
function systemActor(job: JobRow): Actor {
  return { userId: job.createdBy ?? 'system', email: '', name: 'worker', orgId: job.orgId, orgName: '', role: 'admin', isPlatformAdmin: false, uiLocale: 'en' };
}

const P = <T>(job: JobRow) => job.payload as T;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('canceled')); }, { once: true });
});

async function creds(db: DB, orgId: string, providerId: string) {
  const r = await resolveCredentials(db, orgId, providerId);
  return { credentials: r.credentials, config: r.config };
}

// ───────────────────────── plan.generate ─────────────────────────
const planGenerate: Handler = async ({ db, job, progress, signal }) => {
  const actor = systemActor(job);
  const { providerId, modelId, fallbackOffline } = P<{ providerId: string; modelId: string; fallbackOffline?: boolean }>(job);
  const p = await getProject(db, actor, job.projectId!);
  const t = await getTemplate(db, job.orgId, p.templateId!);
  const skeleton = draftPlan(t, p.inputs, { language: p.settings.language, durationSec: p.settings.durationSec, mode: p.productionMode as ProductionMode, audience: p.settings.audience, objective: p.settings.objective, captions: p.settings.captions, voiceover: p.settings.voiceover });
  // Keep media already attached to scenes with the same id.
  const prev = p.plan as ProductionPlan | null;
  for (const s of skeleton.scenes) { const old = prev?.scenes.find((x) => x.id === s.id); if (old?.media) s.media = old.media; if (old) s.mediaMode = old.mediaMode; }
  if (providerId === 'offline') {
    await savePlan(db, actor, p.id, skeleton, 'offline');
    return { source: 'offline', scenes: skeleton.scenes.length };
  }
  await progress(0.1);
  const adapter = getAdapters(providerId).llm;
  if (!adapter) throw Object.assign(new Error(`${providerId} has no LLM adapter`), { retryable: false });
  const brand = p.brandId ? await getBrand(db, job.orgId, p.brandId).catch(() => null) : null;
  try {
    const { plan, usage } = await planWithLlm(skeleton, {
      template: t, inputs: p.inputs, description: p.description ?? undefined, audience: p.settings.audience, objective: p.settings.objective,
      referenceNotes: p.settings.referenceNotes, platforms: p.settings.platforms, brandVoice: brand?.voice, brandName: brand?.name,
    }, adapter, modelId, providerId, { ...(await creds(db, job.orgId, providerId)), signal });
    await savePlan(db, actor, p.id, plan, providerId);
    const cost = estimateCost(providerId, modelId, { inputTokens: usage.inputTokens }) ?? null;
    await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'ai.llm.tokens', quantity: usage.inputTokens + usage.outputTokens, providerId, estimatedCostUsd: cost, jobId: job.id });
    return { source: providerId, model: modelId, usage };
  } catch (e) {
    const retryable = e instanceof ProviderError ? e.retryable : false;
    if (fallbackOffline && (!retryable || job.attempts >= job.maxAttempts)) {
      skeleton.rationale.unshift(`AI planner (${providerId}) failed: ${(e as Error).message.slice(0, 200)} — used the offline template planner instead.`);
      await savePlan(db, actor, p.id, skeleton, 'offline');
      return { source: 'offline-fallback', error: (e as Error).message.slice(0, 500) };
    }
    throw e;
  }
};

// ───────────────────────── asset.image ─────────────────────────
const assetImage: Handler = async ({ db, job, progress, signal }) => {
  const o = P<{ prompt: string; negativePrompt?: string; providerId: string; modelId: string; aspect: string; assign: boolean; variant: number; estimatedCostUsd?: number | null }>(job);
  const adapter = getAdapters(o.providerId).image;
  if (!adapter) throw Object.assign(new Error(`${o.providerId} cannot generate images`), { retryable: false });
  await progress(0.1);
  const img = await adapter.generate({ prompt: o.prompt, negativePrompt: o.negativePrompt, aspect: o.aspect, model: o.modelId }, { ...(await creds(db, job.orgId, o.providerId)), signal });
  const asset = await createAsset(db, { orgId: job.orgId, projectId: job.projectId, createdBy: job.createdBy, name: `scene-${job.sceneId}-v${o.variant}.png`, data: img.data, mimeType: img.mimeType, kind: 'image', source: o.providerId === 'builtin' ? 'procedural' : 'generated', providerId: o.providerId, modelId: o.modelId, prompt: o.prompt, meta: { sceneId: job.sceneId, jobId: job.id, revisedPrompt: img.revisedPrompt } });
  if (o.assign && job.projectId && job.sceneId) await assignSceneMedia(db, systemActor(job), job.projectId, job.sceneId, asset.id);
  await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'ai.image', quantity: 1, providerId: o.providerId, estimatedCostUsd: o.estimatedCostUsd ?? null, jobId: job.id });
  return { assetId: asset.id, assigned: o.assign };
};

// ───────────────────────── asset.video ─────────────────────────
const assetVideo: Handler = async ({ db, job, progress, signal, log }) => {
  const o = P<{ prompt: string; negativePrompt?: string; providerId: string; modelId: string; aspect: string; durationSec: number; imageAssetId?: string; assign: boolean; variant: number; estimatedCostUsd?: number | null }>(job);
  const adapter = getAdapters(o.providerId).video;
  if (!adapter) throw Object.assign(new Error(`${o.providerId} cannot generate video`), { retryable: false });
  const ctx = { ...(await creds(db, job.orgId, o.providerId)), signal };
  let taskId = (job.result as { taskId?: string } | null)?.taskId;
  if (!taskId) {
    let imageUrl: string | undefined;
    if (o.imageAssetId) {
      const a = await getAsset(db, job.orgId, o.imageAssetId);
      imageUrl = publicMediaUrl(a.id, 6 * 3600) ?? `data:${a.mimeType};base64,${(await fs.promises.readFile(await storage().localPath(a.storageKey))).toString('base64')}`;
    }
    taskId = (await adapter.submit({ prompt: o.prompt, negativePrompt: o.negativePrompt, model: o.modelId, aspect: o.aspect, durationSec: o.durationSec, imageUrl }, ctx)).taskId;
    // Persist the provider task id so a retry resumes polling instead of paying twice.
    await progress(0.05, { taskId });
    log(`submitted task ${taskId}`);
  }
  const pollMs = Number(process.env.VIDEO_POLL_MS ?? 5000);
  const deadline = Date.now() + Number(process.env.VIDEO_TIMEOUT_MS ?? 30 * 60_000);
  let url: string | undefined;
  while (Date.now() < deadline) {
    const s = await adapter.poll(taskId, ctx);
    if (s.status === 'succeeded') { url = s.videoUrl; break; }
    if (s.status === 'failed') throw Object.assign(new Error(`video generation failed: ${s.error ?? 'unknown'}`), { retryable: false });
    await progress(Math.min(0.9, 0.1 + (s.progress ?? 0) * 0.8 || 0.3), { taskId });
    await sleep(pollMs, signal);
  }
  if (!url) throw new Error('video generation timed out');
  const data = await adapter.download(url, ctx);
  const asset = await createAsset(db, { orgId: job.orgId, projectId: job.projectId, createdBy: job.createdBy, name: `scene-${job.sceneId}-v${o.variant}.mp4`, data, kind: 'video', source: 'generated', providerId: o.providerId, modelId: o.modelId, prompt: o.prompt, meta: { sceneId: job.sceneId, jobId: job.id, taskId } });
  if (o.assign && job.projectId && job.sceneId) await assignSceneMedia(db, systemActor(job), job.projectId, job.sceneId, asset.id);
  await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'ai.video.seconds', quantity: (asset.durationMs ?? o.durationSec * 1000) / 1000, providerId: o.providerId, estimatedCostUsd: o.estimatedCostUsd ?? null, jobId: job.id });
  return { assetId: asset.id, taskId };
};

// ───────────────────────── asset.voice ─────────────────────────
const assetVoice: Handler = async ({ db, job, progress, signal }) => {
  const o = P<{ providerId: string; modelId: string; voiceId?: string; style?: string; estimatedCostUsd?: number | null }>(job);
  const actor = systemActor(job);
  const adapter = getAdapters(o.providerId).tts;
  if (!adapter) throw Object.assign(new Error(`${o.providerId} cannot synthesize speech`), { retryable: false });
  const ctx = { ...(await creds(db, job.orgId, o.providerId)), signal };
  const p = await getProject(db, actor, job.projectId!);
  const plan = structuredClone(p.plan) as ProductionPlan;
  const voice: NonNullable<ProductionPlan['voiceAssets']> = { ...(plan.voiceAssets ?? {}) };
  const scenes = plan.scenes.filter((s) => s.narration.trim());
  let chars = 0;
  for (const [i, s] of scenes.entries()) {
    const r = await adapter.synthesize({ text: s.narration.replace(/\*/g, ''), voiceId: o.voiceId, model: o.modelId, language: plan.language, style: o.style }, ctx);
    const asset = await createAsset(db, { orgId: job.orgId, projectId: p.id, createdBy: job.createdBy, name: `voice-${s.id}.mp3`, data: r.audio, mimeType: r.mimeType, kind: 'audio', source: 'generated', providerId: o.providerId, modelId: o.modelId, prompt: s.narration, meta: { sceneId: s.id } });
    const durationMs = asset.durationMs ?? r.durationMs ?? Math.round(s.narration.split(/\s+/).length / 2.5 * 1000);
    voice[s.id] = { assetId: asset.id, durationMs, words: r.words?.length ? r.words : estimateWordTimings(s.narration, durationMs) };
    chars += s.narration.length;
    await progress((i + 1) / scenes.length * 0.9);
  }
  plan.voiceAssets = voice;
  plan.voice = { ...plan.voice, enabled: true, providerId: o.providerId, voiceId: o.voiceId ?? null };
  plan.subtitles = { ...plan.subtitles, enabled: true };
  const row = await savePlan(db, actor, p.id, plan);
  await rebuildComposition(db, actor, row, 'Before voiceover');
  await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'ai.tts.chars', quantity: chars, providerId: o.providerId, estimatedCostUsd: o.estimatedCostUsd ?? null, jobId: job.id });
  return { scenes: scenes.length, chars };
};

// ───────────────────────── asset.music ─────────────────────────
const assetMusic: Handler = async ({ db, job, signal }) => {
  const o = P<{ providerId: string; modelId: string; prompt: string; durationMs: number; estimatedCostUsd?: number | null }>(job);
  const actor = systemActor(job);
  const adapter = getAdapters(o.providerId).music;
  if (!adapter) throw Object.assign(new Error(`${o.providerId} cannot generate music`), { retryable: false });
  const r = await adapter.compose({ prompt: o.prompt, durationMs: o.durationMs, model: o.modelId }, { ...(await creds(db, job.orgId, o.providerId)), signal });
  const asset = await createAsset(db, { orgId: job.orgId, projectId: job.projectId, createdBy: job.createdBy, name: 'music', data: r.audio, mimeType: r.mimeType, kind: 'audio', source: o.providerId === 'builtin' ? 'procedural' : 'generated', providerId: o.providerId, modelId: o.modelId, prompt: o.prompt });
  const p = await getProject(db, actor, job.projectId!);
  const plan = structuredClone(p.plan) as ProductionPlan;
  plan.music = { ...plan.music, assetId: asset.id };
  await savePlan(db, actor, p.id, plan);
  // Swap the music clip in place so timeline edits are preserved.
  const comp = structuredClone(p.composition) as Composition | null;
  const clip = comp?.tracks.find((t) => t.role === 'music')?.clips.find((c) => c.type === 'audio');
  if (comp && clip && clip.type === 'audio') {
    clip.media = { assetId: asset.id }; delete clip.procedural;
    await db.update(projects).set({ composition: comp, compositionRevision: p.compositionRevision + 1, updatedAt: new Date() }).where(eq(projects.id, p.id));
  }
  await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'ai.music.seconds', quantity: o.durationMs / 1000, providerId: o.providerId, estimatedCostUsd: o.estimatedCostUsd ?? null, jobId: job.id });
  return { assetId: asset.id };
};

// ───────────────────────── render.video ─────────────────────────
const renderVideo: Handler = async ({ db, job, progress, signal }) => {
  const o = P<{ renderId: string; aspect: Aspect; width: number; height: number; fps: number }>(job);
  const actor = systemActor(job);
  await db.update(renders).set({ status: 'running' }).where(eq(renders.id, o.renderId));
  try {
    const p = await getProject(db, actor, job.projectId!);
    const comp = !p.composition || o.aspect !== p.settings.aspect ? await compositionFor(db, actor, p, o.aspect, { width: o.width, height: o.height }) : p.composition;
    const plan = await getOrgPlan(db, job.orgId);
    const resolve = assetResolver(db, job.orgId);
    const out = tmpFile('mp4');
    const safeName = p.name.replace(/[^\p{L}\p{N}_\- ]/gu, '').slice(0, 60) || 'video';
    try {
      const r = await exportVideo(comp, { outPath: out, width: o.width, height: o.height, fps: o.fps, resolve, signal, watermark: plan.limits.watermark ? 'Made with AI Creator Studio' : null, onProgress: (f) => { void progress(f * 0.95); } });
      const video = await createAssetFromFile(db, { orgId: job.orgId, projectId: p.id, createdBy: job.createdBy, name: `${safeName}-${o.width}x${o.height}.mp4`, filePath: out, mimeType: 'video/mp4', kind: 'render', source: 'render', meta: { renderId: o.renderId } });
      const srt = toSrt(comp); const vtt = toVtt(comp);
      const sub = srt.trim() ? await createAsset(db, { orgId: job.orgId, projectId: p.id, createdBy: job.createdBy, name: `${safeName}.srt`, data: Buffer.from(srt, 'utf8'), mimeType: 'application/x-subrip', kind: 'subtitle', source: 'render', meta: { renderId: o.renderId } }) : null;
      if (vtt.trim().length > 10) await createAsset(db, { orgId: job.orgId, projectId: p.id, createdBy: job.createdBy, name: `${safeName}.vtt`, data: Buffer.from(vtt, 'utf8'), mimeType: 'text/vtt', kind: 'subtitle', source: 'render', meta: { renderId: o.renderId } });
      const thumb = await renderStill(comp, thumbnailTime(comp), { width: o.width, height: o.height, resolve, format: 'jpeg' });
      const th = await createAsset(db, { orgId: job.orgId, projectId: p.id, createdBy: job.createdBy, name: `${safeName}-thumbnail.jpg`, data: thumb, kind: 'thumbnail', source: 'render', meta: { renderId: o.renderId } });
      await db.update(renders).set({ status: 'succeeded', videoAssetId: video.id, subtitleAssetId: sub?.id ?? null, thumbnailAssetId: th.id, durationMs: r.durationMs }).where(eq(renders.id, o.renderId));
      await db.update(projects).set({ status: p.status === 'published' ? 'published' : 'ready', updatedAt: new Date() }).where(eq(projects.id, p.id));
      await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'render.seconds', quantity: r.durationMs / 1000, jobId: job.id });
      return { videoAssetId: video.id, thumbnailAssetId: th.id, subtitleAssetId: sub?.id ?? null, frames: r.frames };
    } finally { fs.rmSync(out, { force: true }); }
  } catch (e) {
    await db.update(renders).set({ status: job.attempts >= job.maxAttempts ? 'failed' : 'queued' }).where(eq(renders.id, o.renderId));
    throw e;
  }
};

// ───────────────────────── publish.post ─────────────────────────
const publishPost: Handler = async ({ db, job, signal }) => {
  const { publicationId } = P<{ publicationId: string }>(job);
  const [pub] = await db.select().from(publications).where(eq(publications.id, publicationId)).limit(1);
  if (!pub || pub.orgId !== job.orgId) throw Object.assign(new Error('publication not found'), { retryable: false });
  if (pub.status === 'canceled') return { skipped: 'canceled' };
  await db.update(publications).set({ status: 'publishing', updatedAt: new Date() }).where(eq(publications.id, pub.id));
  try {
    const [r] = await db.select().from(renders).where(eq(renders.id, pub.renderId!)).limit(1);
    if (!r?.videoAssetId) throw Object.assign(new Error('render has no video'), { retryable: false });
    const video = await getAsset(db, job.orgId, r.videoAssetId);
    const thumb = pub.thumbnailAssetId ? await getAsset(db, job.orgId, pub.thumbnailAssetId).catch(() => null) : null;
    let account: { externalId: string | null; tokens: Record<string, string> } = { externalId: null, tokens: {} };
    if (pub.platform !== 'manual') {
      const { account: acc, tokens } = await accountTokens(db, job.orgId, pub.socialAccountId!);
      let tk = tokens;
      if (acc.expiresAt && acc.expiresAt.getTime() < Date.now() + 5 * 60_000 && (acc.platform === 'youtube' || acc.platform === 'tiktok')) {
        const refreshed = await refreshTokens(acc.platform as OAuthPlatform, tokens);
        if (refreshed) {
          tk = refreshed.tokens;
          await db.update(socialAccounts).set({ encryptedTokens: encryptSecret(JSON.stringify(tk)), expiresAt: refreshed.expiresAt }).where(eq(socialAccounts.id, acc.id));
        }
      }
      account = { externalId: acc.externalId, tokens: tk };
    }
    const result = await PUBLISHERS[pub.platform as keyof typeof PUBLISHERS].publish({
      videoPath: await storage().localPath(video.storageKey), videoUrl: publicMediaUrl(video.id, 6 * 3600),
      thumbnailPath: thumb ? await storage().localPath(thumb.storageKey) : null, title: pub.title, caption: pub.caption, hashtags: pub.hashtags,
      privacy: pub.privacy as 'public' | 'private' | 'unlisted', scheduledAt: pub.scheduledAt && pub.scheduledAt > new Date() ? pub.scheduledAt : null, account,
    }, { signal });
    await db.update(publications).set({ status: result.status === 'manual' ? 'ready-for-manual' : result.status, externalPostId: result.externalPostId ?? null, externalUrl: result.externalUrl ?? null, error: result.note ?? null, updatedAt: new Date() }).where(eq(publications.id, pub.id));
    if (result.status === 'published' || result.status === 'processing') await db.update(projects).set({ status: 'published' }).where(eq(projects.id, pub.projectId));
    await recordUsage(db, { orgId: job.orgId, userId: job.createdBy, kind: 'publish.post', quantity: 1, providerId: pub.platform, jobId: job.id });
    return { ...result };
  } catch (e) {
    const willRetry = (e as { retryable?: boolean }).retryable !== false && job.attempts < job.maxAttempts;
    await db.update(publications).set({ status: willRetry ? 'queued' : 'failed', error: (e as Error).message.slice(0, 1000), updatedAt: new Date() }).where(eq(publications.id, pub.id));
    throw e;
  }
};

export const HANDLERS = {
  'plan.generate': planGenerate,
  'asset.image': assetImage,
  'asset.video': assetVideo,
  'asset.voice': assetVoice,
  'asset.music': assetMusic,
  'render.video': renderVideo,
  'publish.post': publishPost,
} satisfies Record<string, Handler>;

export { probe };
