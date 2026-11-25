/** Google Gemini API — LLM, image generation (Gemini image models) and Veo video (long-running operations). */
import type { ProviderAdapters } from '../types';
import { ProviderError } from '../types';
import { httpJson, httpBuffer, requireCred } from '../http';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const hdr = (key: string) => ({ 'x-goog-api-key': key });

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

export const geminiAdapters: ProviderAdapters = {
  llm: {
    async generate(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'gemini');
      const r = await httpJson<GenerateContentResponse>('gemini', `${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, ctx, {
        headers: hdr(key),
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: { maxOutputTokens: req.maxTokens ?? 16000, ...(req.jsonSchema ? { responseMimeType: 'application/json' } : {}) },
        },
      });
      if (r.promptFeedback?.blockReason) throw new ProviderError(`gemini: blocked (${r.promptFeedback.blockReason})`, 200, false, 'gemini');
      const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new ProviderError('gemini: empty response', 200, true, 'gemini');
      let json: unknown;
      if (req.jsonSchema) { try { json = JSON.parse(text); } catch { /* caller validates */ } }
      return { text, json, model: req.model, usage: { inputTokens: r.usageMetadata?.promptTokenCount ?? 0, outputTokens: r.usageMetadata?.candidatesTokenCount ?? 0 } };
    },
  },
  image: {
    async generate(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'gemini');
      const r = await httpJson<GenerateContentResponse>('gemini', `${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, ctx, {
        headers: hdr(key),
        body: {
          contents: [{ role: 'user', parts: [{ text: `${req.prompt}\nAspect ratio ${req.aspect}.` }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: req.aspect } },
        },
        timeoutMs: 300_000,
      });
      const part = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part?.inlineData) throw new ProviderError('gemini: no image returned', 200, false, 'gemini');
      return { data: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType };
    },
  },
  video: {
    async submit(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'gemini');
      const instance: Record<string, unknown> = { prompt: req.prompt };
      if (req.imageUrl?.startsWith('data:')) {
        const [, mime, b64] = /^data:([^;]+);base64,(.*)$/.exec(req.imageUrl) ?? [];
        if (b64) instance.image = { bytesBase64Encoded: b64, mimeType: mime };
      }
      const parameters: Record<string, unknown> = { aspectRatio: req.aspect === '16:9' ? '16:9' : '9:16' };
      if (req.negativePrompt) parameters.negativePrompt = req.negativePrompt;
      const r = await httpJson<{ name?: string }>('gemini', `${BASE}/models/${encodeURIComponent(req.model)}:predictLongRunning`, ctx, {
        headers: hdr(key), body: { instances: [instance], parameters },
      });
      if (!r.name) throw new ProviderError('gemini: no operation name returned', 200, true, 'gemini');
      return { taskId: r.name };
    },
    async poll(taskId, ctx) {
      const key = requireCred(ctx, 'apiKey', 'gemini');
      const r = await httpJson<{ done?: boolean; error?: { message: string }; response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } } }>(
        'gemini', `${BASE}/${taskId}`, ctx, { headers: hdr(key) },
      );
      if (!r.done) return { status: 'running' };
      if (r.error) return { status: 'failed', error: r.error.message };
      const uri = r.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      return uri ? { status: 'succeeded', videoUrl: uri } : { status: 'failed', error: 'no video in response (possibly filtered)' };
    },
    async download(url, ctx) {
      const key = requireCred(ctx, 'apiKey', 'gemini');
      return httpBuffer('gemini', url, ctx, { headers: hdr(key) });
    },
  },
};
