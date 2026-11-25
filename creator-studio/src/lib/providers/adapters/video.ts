/** Video engines with async task APIs: Runway, Kling, Seedance (BytePlus ModelArk). */
import { createHmac } from 'node:crypto';
import type { ProviderAdapters, VideoTaskStatus } from '../types';
import { ProviderError } from '../types';
import { httpJson, httpBuffer, requireCred } from '../http';

// ───────────────────────── Runway ─────────────────────────
const RUNWAY = 'https://api.dev.runwayml.com/v1';
const runwayHeaders = (key: string) => ({ authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06' });
const runwayRatio = (a: string) => (a === '16:9' ? '1280:720' : a === '1:1' ? '960:960' : '720:1280');

export const runwayAdapters: ProviderAdapters = {
  video: {
    async submit(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'runway');
      const duration = req.durationSec > 5 ? 10 : 5;
      const path = req.imageUrl ? 'image_to_video' : 'text_to_video';
      const body = req.imageUrl
        ? { model: req.model, promptImage: req.imageUrl, promptText: req.prompt, ratio: runwayRatio(req.aspect), duration, ...(req.seed !== undefined ? { seed: req.seed } : {}) }
        : { model: req.model, promptText: req.prompt, ratio: runwayRatio(req.aspect), duration, ...(req.seed !== undefined ? { seed: req.seed } : {}) };
      const r = await httpJson<{ id?: string }>('runway', `${RUNWAY}/${path}`, ctx, { headers: runwayHeaders(key), body });
      if (!r.id) throw new ProviderError('runway: no task id', 200, true, 'runway');
      return { taskId: r.id };
    },
    async poll(taskId, ctx) {
      const key = requireCred(ctx, 'apiKey', 'runway');
      const r = await httpJson<{ status: string; output?: string[]; failure?: string; progress?: number }>('runway', `${RUNWAY}/tasks/${encodeURIComponent(taskId)}`, ctx, { headers: runwayHeaders(key) });
      const map: Record<string, VideoTaskStatus> = { PENDING: 'queued', THROTTLED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELLED: 'failed' };
      const status = map[r.status] ?? 'running';
      return { status, videoUrl: r.output?.[0], error: r.failure, progress: r.progress };
    },
    download: (url, ctx) => httpBuffer('runway', url, ctx),
  },
};

// ───────────────────────── Kling ─────────────────────────
function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
/** HS256 JWT for Kling's access-key/secret-key auth (exp ≤ 30 min). */
export function klingJwt(accessKey: string, secretKey: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: accessKey, exp: nowSec + 1800, nbf: nowSec - 5 }));
  const sig = b64url(createHmac('sha256', secretKey).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
function klingAuth(ctx: { credentials: Record<string, string> }): string {
  if (ctx.credentials.apiKey) return `Bearer ${ctx.credentials.apiKey}`;
  if (ctx.credentials.accessKey && ctx.credentials.secretKey) return `Bearer ${klingJwt(ctx.credentials.accessKey, ctx.credentials.secretKey)}`;
  throw new ProviderError('kling: missing credentials (API key, or access key + secret key)', 401, false, 'kling');
}

export const klingAdapters: ProviderAdapters = {
  video: {
    async submit(req, ctx) {
      const base = (ctx.config?.baseUrl || 'https://api.klingai.com').replace(/\/$/, '');
      const kind = req.imageUrl ? 'image2video' : 'text2video';
      const body: Record<string, unknown> = {
        model_name: req.model, prompt: req.prompt, duration: req.durationSec > 5 ? '10' : '5', mode: ctx.config?.mode || 'std',
        ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      };
      if (req.imageUrl) body.image = req.imageUrl.startsWith('data:') ? req.imageUrl.split(',')[1] : req.imageUrl;
      else body.aspect_ratio = req.aspect === '16:9' ? '16:9' : req.aspect === '1:1' ? '1:1' : '9:16';
      const r = await httpJson<{ code: number; message?: string; data?: { task_id?: string } }>('kling', `${base}/v1/videos/${kind}`, ctx, { headers: { authorization: klingAuth(ctx) }, body });
      if (r.code !== 0 || !r.data?.task_id) throw new ProviderError(`kling: ${r.message ?? 'task not created'} (code ${r.code})`, 200, r.code >= 1300, 'kling');
      return { taskId: `${kind}:${r.data.task_id}` };
    },
    async poll(taskId, ctx) {
      const base = (ctx.config?.baseUrl || 'https://api.klingai.com').replace(/\/$/, '');
      const [kind, id] = taskId.split(':');
      const r = await httpJson<{ code: number; message?: string; data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: Array<{ url: string }> } } }>(
        'kling', `${base}/v1/videos/${kind}/${encodeURIComponent(id)}`, ctx, { headers: { authorization: klingAuth(ctx) } },
      );
      const s = r.data?.task_status;
      if (s === 'succeed') return { status: 'succeeded', videoUrl: r.data?.task_result?.videos?.[0]?.url };
      if (s === 'failed') return { status: 'failed', error: r.data?.task_status_msg ?? r.message };
      return { status: s === 'submitted' ? 'queued' : 'running' };
    },
    download: (url, ctx) => httpBuffer('kling', url, ctx),
  },
};

// ───────────────────────── Seedance (BytePlus ModelArk) ─────────────────────────
export const seedanceAdapters: ProviderAdapters = {
  video: {
    async submit(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'seedance');
      const base = (ctx.config?.baseUrl || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
      const ratio = req.aspect === '16:9' ? '16:9' : req.aspect === '1:1' ? '1:1' : '9:16';
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: `${req.prompt} --ratio ${ratio} --duration ${req.durationSec > 5 ? 10 : 5}` }];
      if (req.imageUrl) content.push({ type: 'image_url', image_url: { url: req.imageUrl } });
      const r = await httpJson<{ id?: string }>('seedance', `${base}/contents/generations/tasks`, ctx, { headers: { authorization: `Bearer ${key}` }, body: { model: req.model, content } });
      if (!r.id) throw new ProviderError('seedance: no task id', 200, true, 'seedance');
      return { taskId: r.id };
    },
    async poll(taskId, ctx) {
      const key = requireCred(ctx, 'apiKey', 'seedance');
      const base = (ctx.config?.baseUrl || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
      const r = await httpJson<{ status?: string; content?: { video_url?: string }; error?: { message?: string } }>('seedance', `${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`, ctx, { headers: { authorization: `Bearer ${key}` } });
      if (r.status === 'succeeded') return { status: 'succeeded', videoUrl: r.content?.video_url };
      if (r.status === 'failed' || r.status === 'cancelled' || r.status === 'expired') return { status: 'failed', error: r.error?.message ?? r.status };
      return { status: r.status === 'queued' ? 'queued' : 'running' };
    },
    download: (url, ctx) => httpBuffer('seedance', url, ctx),
  },
};
