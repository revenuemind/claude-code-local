/** OAuth 2.0 helpers for social account connections (official flows only). */
import { createHash } from 'node:crypto';
import { randomToken } from '../security/crypto';
import { httpJson } from '../providers/http';

export type OAuthPlatform = 'youtube' | 'tiktok' | 'facebook' | 'instagram';

const GRAPH = process.env.META_GRAPH_VERSION || 'v24.0';

export function oauthConfigured(p: OAuthPlatform): boolean {
  if (p === 'youtube') return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (p === 'tiktok') return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function redirectUri(p: OAuthPlatform): string {
  const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/publishing/oauth/${p}/callback`;
}

export function pkce() {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizationUrl(p: OAuthPlatform, state: string, codeChallenge: string): string {
  const u = (base: string, q: Record<string, string>) => `${base}?${new URLSearchParams(q).toString()}`;
  switch (p) {
    case 'youtube':
      return u('https://accounts.google.com/o/oauth2/v2/auth', {
        client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(p), response_type: 'code', access_type: 'offline', prompt: 'consent',
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', state,
        code_challenge: codeChallenge, code_challenge_method: 'S256',
      });
    case 'tiktok':
      return u('https://www.tiktok.com/v2/auth/authorize/', {
        client_key: process.env.TIKTOK_CLIENT_KEY!, redirect_uri: redirectUri(p), response_type: 'code', scope: 'user.info.basic,video.publish,video.upload', state,
        code_challenge: codeChallenge, code_challenge_method: 'S256',
      });
    case 'facebook':
    case 'instagram':
      return u(`https://www.facebook.com/${GRAPH}/dialog/oauth`, {
        client_id: process.env.META_APP_ID!, redirect_uri: redirectUri(p), state, response_type: 'code',
        scope: p === 'instagram' ? 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement' : 'pages_show_list,pages_manage_posts,pages_read_engagement,publish_video',
      });
  }
}

export interface ConnectedAccount { displayName: string; externalId: string | null; tokens: Record<string, string>; scopes: string[]; expiresAt: Date | null }

export async function exchangeCode(p: OAuthPlatform, code: string, verifier: string): Promise<ConnectedAccount[]> {
  const ctx = { credentials: {} };
  if (p === 'youtube') {
    const t = await httpJson<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>('youtube', 'https://oauth2.googleapis.com/token', ctx, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(p), grant_type: 'authorization_code', code_verifier: verifier }).toString(),
    });
    const ch = await httpJson<{ items?: Array<{ id: string; snippet: { title: string } }> }>('youtube', 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', ctx, { headers: { authorization: `Bearer ${t.access_token}` } });
    const c = ch.items?.[0];
    return [{ displayName: c?.snippet.title ?? 'YouTube channel', externalId: c?.id ?? null, tokens: { accessToken: t.access_token, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}) }, scopes: t.scope.split(' '), expiresAt: new Date(Date.now() + t.expires_in * 1000) }];
  }
  if (p === 'tiktok') {
    const t = await httpJson<{ access_token: string; refresh_token: string; expires_in: number; open_id: string; scope: string }>('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', ctx, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, code, grant_type: 'authorization_code', redirect_uri: redirectUri(p), code_verifier: verifier }).toString(),
    });
    return [{ displayName: 'TikTok account', externalId: t.open_id, tokens: { accessToken: t.access_token, refreshToken: t.refresh_token, audited: process.env.TIKTOK_APP_AUDITED === 'true' ? 'true' : 'false' }, scopes: t.scope.split(','), expiresAt: new Date(Date.now() + t.expires_in * 1000) }];
  }
  // Meta: exchange for a user token, then list Pages (and linked IG business accounts).
  const t = await httpJson<{ access_token: string }>(p, `https://graph.facebook.com/${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirectUri(p), code })}`, ctx);
  const pages = await httpJson<{ data: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }> }>(p, `https://graph.facebook.com/${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(t.access_token)}`, ctx);
  if (p === 'instagram') {
    return pages.data.filter((pg) => pg.instagram_business_account).map((pg) => ({ displayName: `${pg.name} (Instagram)`, externalId: pg.instagram_business_account!.id, tokens: { accessToken: pg.access_token }, scopes: [], expiresAt: null }));
  }
  return pages.data.map((pg) => ({ displayName: pg.name, externalId: pg.id, tokens: { accessToken: pg.access_token }, scopes: [], expiresAt: null }));
}

/** Refresh an expiring access token where the platform supports it. */
export async function refreshTokens(p: OAuthPlatform, tokens: Record<string, string>): Promise<{ tokens: Record<string, string>; expiresAt: Date } | null> {
  const ctx = { credentials: {} };
  if (p === 'youtube' && tokens.refreshToken) {
    const t = await httpJson<{ access_token: string; expires_in: number }>('youtube', 'https://oauth2.googleapis.com/token', ctx, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }).toString(),
    });
    return { tokens: { ...tokens, accessToken: t.access_token }, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }
  if (p === 'tiktok' && tokens.refreshToken) {
    const t = await httpJson<{ access_token: string; refresh_token: string; expires_in: number }>('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', ctx, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }).toString(),
    });
    return { tokens: { ...tokens, accessToken: t.access_token, refreshToken: t.refresh_token }, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }
  return null;
}
