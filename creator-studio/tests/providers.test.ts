/**
 * Provider adapters against simulated HTTP responses shaped like each
 * provider's documented API. These verify request construction, polling
 * state machines and error handling — NOT live provider behavior.
 */
import { describe, expect, it } from 'vitest';
import { anthropicAdapters } from '../src/lib/providers/adapters/anthropic';
import { openaiAdapters } from '../src/lib/providers/adapters/openai';
import { geminiAdapters } from '../src/lib/providers/adapters/gemini';
import { runwayAdapters, klingAdapters, seedanceAdapters, klingJwt } from '../src/lib/providers/adapters/video';
import { elevenlabsAdapters, alignmentToWords } from '../src/lib/providers/adapters/elevenlabs';
import { builtinAdapters } from '../src/lib/providers/adapters/builtin';
import { ProviderError } from '../src/lib/providers/types';
import { PROVIDERS, getAdapters, estimateCost } from '../src/lib/providers/registry';
import { createHmac } from 'node:crypto';

type Call = { url: string; init: RequestInit };
function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: { ...init, headers: init.headers ?? (input as Request).headers } });
    return handler(url, init, calls.length);
  }) as typeof fetch;
  return { f, calls };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const hdr = (c: Call, k: string) => new Headers(c.init.headers as HeadersInit).get(k);

describe('provider catalog', () => {
  it('discontinued/manual providers expose no adapters and are labeled honestly', () => {
    expect(getAdapters('openai-sora')).toEqual({});
    expect(getAdapters('suno')).toEqual({});
    expect(PROVIDERS.find((p) => p.id === 'openai-sora')!.status).toBe('discontinued');
    for (const p of PROVIDERS.filter((x) => x.status === 'implemented')) expect(p.statusNote).toMatch(/mock/i);
    expect(estimateCost('runway', 'gen4_turbo', { seconds: 10 })).toBeCloseTo(0.5);
    expect(estimateCost('builtin', 'procedural-music', { seconds: 60 })).toBe(0);
  });
});

describe('Anthropic (official SDK)', () => {
  it('sends structured-output request with refusal fallback and parses JSON', async () => {
    const { f, calls } = mockFetch(() => json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"T"}' }], usage: { input_tokens: 10, output_tokens: 5 } }));
    const r = await anthropicAdapters.llm!.generate({ system: 's', prompt: 'p', model: 'claude-opus-5-5', jsonSchema: { type: 'object' } }, { credentials: { apiKey: 'sk-ant-test' }, fetch: f });
    expect(r.json).toEqual({ title: 'T' });
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toContain('/v1/messages');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.output_config.format).toEqual({ type: 'json_schema', schema: { type: 'object' } });
    expect(body.fallbacks).toBe('default');
    // SDK 1.x authenticates with a Bearer token (older versions used x-api-key).
    expect(hdr(calls[0], 'x-api-key') ?? hdr(calls[0], 'authorization')).toMatch(/sk-ant-test$/);
  });
  it('maps refusals and 4xx to non-retryable ProviderErrors', async () => {
    const refusal = mockFetch(() => json({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [], usage: { input_tokens: 1, output_tokens: 0 } }));
    await expect(anthropicAdapters.llm!.generate({ system: '', prompt: '', model: 'claude-haiku-5-5' }, { credentials: { apiKey: 'k' }, fetch: refusal.f })).rejects.toMatchObject({ retryable: false });
    const bad = mockFetch(() => json({ type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }, 400));
    await expect(anthropicAdapters.llm!.generate({ system: '', prompt: '', model: 'claude-haiku-5-5' }, { credentials: { apiKey: 'k' }, fetch: bad.f })).rejects.toMatchObject({ status: 400, retryable: false });
    await expect(anthropicAdapters.llm!.generate({ system: '', prompt: '', model: 'x' }, { credentials: {} })).rejects.toThrow(/missing credential/);
  });
});

describe('OpenAI', () => {
  it('images (b64) and speech', async () => {
    const { f, calls } = mockFetch((url) => url.endsWith('/images/generations') ? json({ data: [{ b64_json: Buffer.from('PNGDATA').toString('base64') }] }) : new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const img = await openaiAdapters.image!.generate({ prompt: 'cat', aspect: '9:16', model: 'gpt-image-2' }, { credentials: { apiKey: 'k' }, fetch: f });
    expect(img.data.toString()).toBe('PNGDATA');
    expect(JSON.parse(String(calls[0].init.body)).size).toBe('1024x1536');
    const tts = await openaiAdapters.tts!.synthesize({ text: 'hi', model: 'gpt-4o-mini-tts', language: 'en' }, { credentials: { apiKey: 'k' }, fetch: f });
    expect([...tts.audio]).toEqual([1, 2, 3]);
  });
  it('rate limits are retryable', async () => {
    const { f } = mockFetch(() => json({ error: { message: 'slow down' } }, 429));
    const e = await openaiAdapters.image!.generate({ prompt: 'x', aspect: '1:1', model: 'm' }, { credentials: { apiKey: 'k' }, fetch: f }).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.retryable).toBe(true);
  });
});

describe('Gemini / Veo', () => {
  it('submits a long-running operation, polls until done, downloads with the key', async () => {
    let polls = 0;
    const { f, calls } = mockFetch((url) => {
      if (url.includes(':predictLongRunning')) return json({ name: 'models/veo/operations/op1' });
      if (url.includes('operations/op1')) { polls++; return json(polls < 2 ? { done: false } : { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://files/v.mp4' } }] } } }); }
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    const ctx = { credentials: { apiKey: 'g' }, fetch: f };
    const { taskId } = await geminiAdapters.video!.submit({ prompt: 'p', model: 'veo-3.1-generate-preview', aspect: '9:16', durationSec: 8 }, ctx);
    expect((await geminiAdapters.video!.poll(taskId, ctx)).status).toBe('running');
    const done = await geminiAdapters.video!.poll(taskId, ctx);
    expect(done).toEqual({ status: 'succeeded', videoUrl: 'https://files/v.mp4' });
    expect((await geminiAdapters.video!.download(done.videoUrl!, ctx))[0]).toBe(9);
    expect(JSON.parse(String(calls[0].init.body)).parameters.aspectRatio).toBe('9:16');
    expect(hdr(calls[0], 'x-goog-api-key')).toBe('g');
  });
});

describe('Runway, Kling, Seedance', () => {
  it('Runway picks text/image endpoint, sends version header and maps statuses', async () => {
    const { f, calls } = mockFetch((url) => url.includes('/tasks/') ? json({ status: 'SUCCEEDED', output: ['https://out/x.mp4'] }) : json({ id: 'task1' }));
    const ctx = { credentials: { apiKey: 'r' }, fetch: f };
    await runwayAdapters.video!.submit({ prompt: 'p', model: 'gen4.5', aspect: '16:9', durationSec: 8 }, ctx);
    await runwayAdapters.video!.submit({ prompt: 'p', model: 'gen4_turbo', aspect: '9:16', durationSec: 4, imageUrl: 'https://img' }, ctx);
    expect(calls[0].url).toMatch(/text_to_video$/); expect(calls[1].url).toMatch(/image_to_video$/);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ ratio: '1280:720', duration: 10 });
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({ ratio: '720:1280', duration: 5, promptImage: 'https://img' });
    expect(hdr(calls[0], 'x-runway-version')).toBe('2024-11-06');
    expect(await runwayAdapters.video!.poll('task1', ctx)).toMatchObject({ status: 'succeeded', videoUrl: 'https://out/x.mp4' });
  });
  it('Kling signs an HS256 JWT from access/secret keys and maps task status', async () => {
    const jwt = klingJwt('AK', 'SK', 1_700_000_000);
    const [h, p, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({ iss: 'AK', exp: 1_700_001_800, nbf: 1_699_999_995 });
    expect(s).toBe(createHmac('sha256', 'SK').update(`${h}.${p}`).digest('base64url'));
    const { f, calls } = mockFetch((url) => url.endsWith('/text2video') ? json({ code: 0, data: { task_id: 'k1' } }) : json({ code: 0, data: { task_status: 'failed', task_status_msg: 'nsfw' } }));
    const ctx = { credentials: { accessKey: 'AK', secretKey: 'SK' }, fetch: f };
    const { taskId } = await klingAdapters.video!.submit({ prompt: 'p', model: 'kling-v2-1', aspect: '9:16', durationSec: 5 }, ctx);
    expect(taskId).toBe('text2video:k1');
    expect(hdr(calls[0], 'authorization')).toMatch(/^Bearer ey/);
    expect(await klingAdapters.video!.poll(taskId, ctx)).toEqual({ status: 'failed', error: 'nsfw' });
  });
  it('Seedance builds ModelArk content parameters', async () => {
    const { f, calls } = mockFetch((url) => url.endsWith('/tasks') ? json({ id: 's1' }) : json({ status: 'succeeded', content: { video_url: 'https://v' } }));
    const ctx = { credentials: { apiKey: 'b' }, fetch: f };
    await seedanceAdapters.video!.submit({ prompt: 'p', model: 'seedance-2-5', aspect: '1:1', durationSec: 10 }, ctx);
    expect(JSON.parse(String(calls[0].init.body)).content[0].text).toContain('--ratio 1:1 --duration 10');
    expect(await seedanceAdapters.video!.poll('s1', ctx)).toEqual({ status: 'succeeded', videoUrl: 'https://v' });
  });
});

describe('ElevenLabs & built-in', () => {
  it('converts character alignment into word timings for captions', async () => {
    const chars = 'Hi there'.split('');
    const words = alignmentToWords({ characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) });
    expect(words).toEqual([{ text: 'Hi', start: 0, end: 200 }, { text: 'there', start: 300, end: 800 }]);
    const { f, calls } = mockFetch(() => json({ audio_base64: Buffer.from('MP3').toString('base64'), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) } }));
    const r = await elevenlabsAdapters.tts!.synthesize({ text: 'Hi there', voiceId: 'v1', model: 'eleven_multilingual_v2', language: 'he' }, { credentials: { apiKey: 'e' }, fetch: f });
    expect(r.audio.toString()).toBe('MP3');
    expect(r.words).toHaveLength(2);
    expect(calls[0].url).toContain('/text-to-speech/v1/with-timestamps');
    expect(JSON.parse(String(calls[0].init.body)).language_code).toBe('he');
  });
  it('built-in engine produces procedural music and stills without network', async () => {
    const m = await builtinAdapters.music!.compose({ prompt: 'calm 90 bpm', durationMs: 500, model: 'procedural-music' }, { credentials: {} });
    expect(m.audio.subarray(0, 4).toString()).toBe('RIFF');
    const img = await builtinAdapters.image!.generate({ prompt: 'sunset', aspect: '1:1', model: 'procedural-still' }, { credentials: {} });
    expect(img.data.subarray(1, 4).toString()).toBe('PNG');
  });
});
