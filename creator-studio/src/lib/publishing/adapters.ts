/**
 * Publishing adapters for official platform APIs. Each is written against the
 * platform's documented endpoints and unit-tested with mocked HTTP; none has
 * been exercised against a live account from this build environment.
 *
 * Platform realities (surfaced in the UI):
 *  - YouTube: uploads from unverified Google Cloud projects may be locked private until audited.
 *  - TikTok: unaudited Content Posting API clients can only post SELF_ONLY (private).
 *  - Instagram: Reels require a Business/Creator account linked to a Facebook Page.
 */
import fs from 'node:fs';
import { http, httpJson } from '../providers/http';
import { ProviderError, type AdapterContext } from '../providers/types';
import type { PublishPlatform } from './captions';

export interface PublishInput {
  videoPath: string;
  /** Short-lived public URL of the video (required by Blotato; optional for Instagram). */
  videoUrl?: string | null;
  thumbnailPath?: string | null;
  title: string;
  caption: string;
  hashtags: string[];
  privacy: 'public' | 'private' | 'unlisted';
  scheduledAt?: Date | null;
  account: { externalId: string | null; tokens: Record<string, string> };
}

export interface PublishResult { status: 'published' | 'processing' | 'scheduled' | 'manual'; externalPostId?: string; externalUrl?: string; note?: string }

export interface PublishAdapter { publish(input: PublishInput, ctx: Omit<AdapterContext, 'credentials'>): Promise<PublishResult> }

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';

function token(input: PublishInput, platform: string): string {
  const t = input.account.tokens.accessToken;
  if (!t) throw new ProviderError(`${platform}: account is not connected (no access token)`, 401, false, platform);
  return t;
}

const withTags = (caption: string, tags: string[]) => {
  const missing = tags.filter((t) => !caption.includes(t));
  return missing.length ? `${caption}\n\n${missing.join(' ')}`.trim() : caption;
};

// ───────────────────────── YouTube (Data API v3, resumable upload) ─────────────────────────
export const youtube: PublishAdapter = {
  async publish(input, ctx) {
    const at = token(input, 'youtube');
    const size = fs.statSync(input.videoPath).size;
    const status: Record<string, unknown> = { privacyStatus: input.scheduledAt ? 'private' : input.privacy, selfDeclaredMadeForKids: false };
    if (input.scheduledAt) status.publishAt = input.scheduledAt.toISOString();
    const init = await http('youtube', 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { ...ctx, credentials: {} }, {
      headers: { authorization: `Bearer ${at}`, 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) },
      body: { snippet: { title: input.title.slice(0, 100), description: input.caption.slice(0, 5000), tags: input.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 30), categoryId: '22' }, status },
    });
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new ProviderError('youtube: no resumable upload URL returned', 200, true, 'youtube');
    const res = await http('youtube', uploadUrl, { ...ctx, credentials: {} }, {
      method: 'PUT', headers: { authorization: `Bearer ${at}`, 'content-type': 'video/mp4' }, body: new Uint8Array(fs.readFileSync(input.videoPath)), timeoutMs: 60 * 60_000,
    });
    const video = (await res.json()) as { id?: string };
    if (!video.id) throw new ProviderError('youtube: upload finished without a video id', 200, false, 'youtube');
    if (input.thumbnailPath) {
      await http('youtube', `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, { ...ctx, credentials: {} }, {
        method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'image/jpeg' }, body: new Uint8Array(fs.readFileSync(input.thumbnailPath)),
      }).catch(() => null); // custom thumbnails need a verified channel; non-fatal
    }
    return { status: input.scheduledAt ? 'scheduled' : 'published', externalPostId: video.id, externalUrl: `https://www.youtube.com/watch?v=${video.id}` };
  },
};

// ───────────────────────── TikTok (Content Posting API, direct post) ─────────────────────────
export const tiktok: PublishAdapter = {
  async publish(input, ctx) {
    const at = token(input, 'tiktok');
    const size = fs.statSync(input.videoPath).size;
    const chunk = Math.min(size, 10 * 1024 * 1024);
    const chunks = Math.max(1, Math.floor(size / chunk));
    const privacy = input.account.tokens.audited === 'true' && input.privacy === 'public' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';
    const init = await httpJson<{ data?: { publish_id?: string; upload_url?: string }; error?: { code: string; message: string } }>(
      'tiktok', 'https://open.tiktokapis.com/v2/post/publish/video/init/', { ...ctx, credentials: {} }, {
        headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json; charset=UTF-8' },
        body: { post_info: { title: withTags(input.caption, input.hashtags).slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: chunks } },
      },
    );
    if (init.error && init.error.code !== 'ok') throw new ProviderError(`tiktok: ${init.error.message}`, 200, false, 'tiktok');
    const { publish_id, upload_url } = init.data ?? {};
    if (!publish_id || !upload_url) throw new ProviderError('tiktok: init returned no upload URL', 200, true, 'tiktok');
    const buf = fs.readFileSync(input.videoPath);
    for (let i = 0; i < chunks; i++) {
      const start = i * chunk; const end = i === chunks - 1 ? size - 1 : start + chunk - 1;
      await http('tiktok', upload_url, { ...ctx, credentials: {} }, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${start}-${end}/${size}` }, body: new Uint8Array(buf.subarray(start, end + 1)), timeoutMs: 30 * 60_000 });
    }
    return { status: 'processing', externalPostId: publish_id, note: privacy === 'SELF_ONLY' ? 'Posted as private (SELF_ONLY): unaudited TikTok apps cannot post publicly.' : undefined };
  },
};

// ───────────────────────── Instagram (Reels via resumable upload) ─────────────────────────
export const instagram: PublishAdapter = {
  async publish(input, ctx) {
    const at = token(input, 'instagram');
    const igUser = input.account.externalId;
    if (!igUser) throw new ProviderError('instagram: missing Instagram business account id', 400, false, 'instagram');
    const c = { ...ctx, credentials: {} };
    const caption = withTags(input.caption, input.hashtags).slice(0, 2200);
    let containerId: string;
    if (input.videoUrl) {
      const r = await httpJson<{ id: string }>('instagram', `https://graph.facebook.com/${GRAPH_VERSION}/${igUser}/media`, c, { body: { media_type: 'REELS', video_url: input.videoUrl, caption, share_to_feed: true, access_token: at } });
      containerId = r.id;
    } else {
      const r = await httpJson<{ id: string; uri: string }>('instagram', `https://graph.facebook.com/${GRAPH_VERSION}/${igUser}/media`, c, { body: { media_type: 'REELS', upload_type: 'resumable', caption, share_to_feed: true, access_token: at } });
      const size = fs.statSync(input.videoPath).size;
      await http('instagram', r.uri, c, { method: 'POST', headers: { authorization: `OAuth ${at}`, offset: '0', file_size: String(size) }, body: new Uint8Array(fs.readFileSync(input.videoPath)), timeoutMs: 30 * 60_000 });
      containerId = r.id;
    }
    for (let i = 0; i < 60; i++) {
      const s = await httpJson<{ status_code?: string }>('instagram', `https://graph.facebook.com/${GRAPH_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(at)}`, c);
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new ProviderError(`instagram: container ${s.status_code}`, 200, false, 'instagram');
      await new Promise((r) => setTimeout(r, Number(process.env.PUBLISH_POLL_MS ?? 5000)));
    }
    const pub = await httpJson<{ id: string }>('instagram', `https://graph.facebook.com/${GRAPH_VERSION}/${igUser}/media_publish`, c, { body: { creation_id: containerId, access_token: at } });
    return { status: 'published', externalPostId: pub.id };
  },
};

// ───────────────────────── Facebook Page video ─────────────────────────
export const facebook: PublishAdapter = {
  async publish(input, ctx) {
    const at = token(input, 'facebook');
    const page = input.account.externalId;
    if (!page) throw new ProviderError('facebook: missing Page id', 400, false, 'facebook');
    const form = new FormData();
    form.append('access_token', at);
    form.append('title', input.title.slice(0, 255));
    form.append('description', withTags(input.caption, input.hashtags));
    if (input.scheduledAt) { form.append('published', 'false'); form.append('scheduled_publish_time', String(Math.floor(input.scheduledAt.getTime() / 1000))); }
    form.append('source', new Blob([new Uint8Array(fs.readFileSync(input.videoPath))], { type: 'video/mp4' }), 'video.mp4');
    const f = ctx.fetch ?? fetch;
    const res = await f(`https://graph-video.facebook.com/${GRAPH_VERSION}/${page}/videos`, { method: 'POST', body: form, signal: ctx.signal });
    if (!res.ok) throw new ProviderError(`facebook HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status, res.status >= 500 || res.status === 429, 'facebook');
    const j = (await res.json()) as { id?: string };
    return { status: input.scheduledAt ? 'scheduled' : 'published', externalPostId: j.id, externalUrl: j.id ? `https://www.facebook.com/${page}/videos/${j.id}` : undefined };
  },
};

// ───────────────────────── Blotato (optional third-party publisher) ─────────────────────────
export const blotato: PublishAdapter = {
  async publish(input, ctx) {
    const key = input.account.tokens.apiKey;
    if (!key) throw new ProviderError('blotato: missing API key', 401, false, 'blotato');
    if (!input.videoUrl) throw new ProviderError('blotato: requires APP_PUBLIC_URL so Blotato can fetch the video', 400, false, 'blotato');
    const c = { ...ctx, credentials: {} };
    const media = await httpJson<{ url: string }>('blotato', 'https://backend.blotato.com/v2/media', c, { headers: { 'blotato-api-key': key }, body: { url: input.videoUrl } });
    const target = input.account.tokens.targetPlatform || 'tiktok';
    const body: Record<string, unknown> = {
      post: { accountId: input.account.externalId, content: { text: withTags(input.caption, input.hashtags), mediaUrls: [media.url], platform: target }, target: { targetType: target } },
    };
    if (input.scheduledAt) body.scheduledTime = input.scheduledAt.toISOString();
    const r = await httpJson<{ postSubmissionId: string }>('blotato', 'https://backend.blotato.com/v2/posts', c, { headers: { 'blotato-api-key': key }, body });
    return { status: input.scheduledAt ? 'scheduled' : 'processing', externalPostId: r.postSubmissionId };
  },
};

// ───────────────────────── Manual (download & post yourself) ─────────────────────────
export const manual: PublishAdapter = {
  async publish() { return { status: 'manual', note: 'Download the video and caption and post them yourself.' }; },
};

export const PUBLISHERS: Record<PublishPlatform, PublishAdapter> = { youtube, tiktok, instagram, facebook, blotato, manual };
