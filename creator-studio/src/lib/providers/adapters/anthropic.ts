/** Anthropic (Claude) — production planner / script writer via the official SDK. */
import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, type ProviderAdapters } from '../types';
import { requireCred } from '../http';

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export const anthropicAdapters: ProviderAdapters = {
  llm: {
    async generate(req, ctx) {
      const client = new Anthropic({ apiKey: requireCred(ctx, 'apiKey', 'anthropic'), fetch: ctx.fetch, maxRetries: 2 });
      const useFallback = FALLBACK_MODELS.has(req.model);
      const effort = (ctx.config?.effort as 'low' | 'medium' | 'high' | undefined) ?? 'medium';
      try {
        const res = await client.beta.messages.create(
          {
            model: req.model,
            max_tokens: req.maxTokens ?? 16000,
            system: req.system,
            messages: [{ role: 'user', content: req.prompt }],
            output_config: {
              effort,
              ...(req.jsonSchema ? { format: { type: 'json_schema' as const, schema: req.jsonSchema } } : {}),
            },
            ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal: ctx.signal },
        );
        if (res.stop_reason === 'refusal') {
          throw new ProviderError(`anthropic: request declined (${res.stop_details?.category ?? 'policy'})`, 200, false, 'anthropic');
        }
        if (res.stop_reason === 'max_tokens') {
          throw new ProviderError('anthropic: response truncated (max_tokens reached)', 200, true, 'anthropic');
        }
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        let json: unknown;
        if (req.jsonSchema) { try { json = JSON.parse(text); } catch { /* validated by caller */ } }
        return { text, json, model: res.model, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if (e instanceof Anthropic.APIError) {
          const status = e.status ?? null;
          const retryable = status === null || status === 408 || status === 409 || status === 429 || status >= 500;
          throw new ProviderError(`anthropic HTTP ${status}: ${e.message.slice(0, 300)}`, status, retryable, 'anthropic');
        }
        throw new ProviderError(`anthropic: ${(e as Error).message}`, null, true, 'anthropic');
      }
    },
  },
};
