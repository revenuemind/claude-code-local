/** OpenAI — LLM (Chat Completions), images (GPT Image), speech (TTS). Sora video API was shut down (2026-09-24). */
import type { ProviderAdapters } from '../types';
import { ProviderError } from '../types';
import { httpJson, httpBuffer, requireCred } from '../http';

const BASE = 'https://api.openai.com/v1';
const auth = (key: string) => ({ authorization: `Bearer ${key}` });

export const openaiAdapters: ProviderAdapters = {
  llm: {
    async generate(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'openai');
      const body: Record<string, unknown> = {
        model: req.model,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
        max_completion_tokens: req.maxTokens ?? 16000,
      };
      if (req.jsonSchema) body.response_format = { type: 'json_schema', json_schema: { name: 'result', schema: req.jsonSchema, strict: false } };
      const r = await httpJson<{ model: string; choices: Array<{ message: { content: string | null; refusal?: string | null }; finish_reason: string }>; usage?: { prompt_tokens: number; completion_tokens: number } }>(
        'openai', `${BASE}/chat/completions`, ctx, { headers: auth(key), body },
      );
      const c = r.choices[0];
      if (!c?.message?.content) throw new ProviderError(`openai: empty response${c?.message?.refusal ? ` (refusal: ${c.message.refusal})` : ''}`, 200, false, 'openai');
      let json: unknown;
      if (req.jsonSchema) { try { json = JSON.parse(c.message.content); } catch { /* caller validates */ } }
      return { text: c.message.content, json, model: r.model, usage: { inputTokens: r.usage?.prompt_tokens ?? 0, outputTokens: r.usage?.completion_tokens ?? 0 } };
    },
  },
  image: {
    async generate(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'openai');
      const size = req.aspect === '16:9' ? '1536x1024' : req.aspect === '1:1' ? '1024x1024' : '1024x1536';
      const r = await httpJson<{ data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> }>(
        'openai', `${BASE}/images/generations`, ctx, { headers: auth(key), body: { model: req.model, prompt: req.prompt, size, n: 1 }, timeoutMs: 300_000 },
      );
      const d = r.data[0];
      if (d?.b64_json) return { data: Buffer.from(d.b64_json, 'base64'), mimeType: 'image/png', revisedPrompt: d.revised_prompt };
      if (d?.url) return { data: await httpBuffer('openai', d.url, ctx), mimeType: 'image/png' };
      throw new ProviderError('openai: no image returned', 200, false, 'openai');
    },
  },
  tts: {
    async synthesize(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'openai');
      const audio = await httpBuffer('openai', `${BASE}/audio/speech`, ctx, {
        headers: auth(key),
        body: { model: req.model, voice: req.voiceId || 'alloy', input: req.text, response_format: 'mp3', ...(req.style ? { instructions: req.style } : {}) },
      });
      return { audio, mimeType: 'audio/mpeg' };
    },
  },
};
