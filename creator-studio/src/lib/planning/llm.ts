/**
 * AI production planner. The template engine produces the structural skeleton
 * (scenes, layouts, media slots, timing); the LLM rewrites the *content* —
 * hook, script, on-screen text, narration, shot descriptions and visual
 * prompts — in the target language. Output is schema-validated and merged
 * back into the skeleton, so an LLM can never break the composition builder.
 */
import { z } from 'zod';
import type { ProductionPlan } from './types';
import type { TemplateDefinition } from '../templates/types';
import { llmPlanSchema, type LlmPlan } from './schema';
import type { LlmAdapter, AdapterContext } from '../providers/types';
import { estimateRequirements, composeNarration } from '../templates/engine';
import { wordsPerSecond } from '../templates/phrases';

const LANG_NAMES: Record<string, string> = { en: 'English', he: 'Hebrew', ru: 'Russian', ar: 'Arabic', am: 'Amharic', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', tr: 'Turkish', uk: 'Ukrainian' };

export function plannerJsonSchema(): Record<string, unknown> {
  const s = z.toJSONSchema(llmPlanSchema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export interface PlannerContext {
  template: TemplateDefinition;
  inputs: Record<string, unknown>;
  description?: string;
  audience?: string;
  objective?: string;
  referenceNotes?: string;
  platforms?: string[];
  brandVoice?: string | null;
  brandName?: string | null;
}

export function buildPlannerPrompt(skeleton: ProductionPlan, c: PlannerContext): { system: string; prompt: string } {
  const lang = LANG_NAMES[skeleton.language] ?? skeleton.language;
  const system = [
    'You are a senior video producer and scriptwriter for short-form and long-form social video.',
    'You write tight, specific, high-retention scripts: a strong hook in the first 2 seconds, one idea per scene, concrete details, no filler, no clichés, no hashtags inside the script.',
    `Write every viewer-facing field (headline, body, kicker, label, narration, bullets, left/right text) in ${lang}. Also write title, concept, hook, visualDirection, musicDirection and rationale in ${lang} (the creator reads them). Write shotDescription and visualPrompt in English (they are sent to image/video models).`,
    'On-screen text must be short: headlines ≤ 8 words, body ≤ 18 words. Wrap at most one key word per headline in *asterisks* for emphasis.',
    `Narration for a scene must be speakable within its duration at about ${wordsPerSecond(skeleton.language)} words per second.`,
    'visualPrompt: a single vivid, concrete description for an AI image/video model (subject, setting, lighting, camera, mood). Never include text, logos, real people’s names or copyrighted characters.',
    'Never invent statistics, quotes, prices, or claims that are not in the brief; if a number is needed and not provided, phrase the line without one.',
    'Return JSON only, matching the provided schema. Keep every scene id exactly as given and return the scenes in the same order.',
  ].join('\n');
  const brief = {
    template: { name: c.template.name.en, description: c.template.description.en, category: c.template.category },
    language: lang,
    targetDurationSec: skeleton.targetDurationSec,
    platforms: c.platforms ?? c.template.platforms,
    audience: c.audience || undefined,
    objective: c.objective || undefined,
    description: c.description || undefined,
    referenceNotes: c.referenceNotes?.slice(0, 6000) || undefined,
    brand: c.brandName ? { name: c.brandName, voice: c.brandVoice ?? undefined } : undefined,
    userInputs: c.inputs,
    scenes: skeleton.scenes.map((s) => ({
      id: s.id, role: s.role, layout: s.layout, durationSec: s.durationSec, mediaKind: s.mediaKind,
      draft: { headline: s.headline, body: s.body, kicker: s.kicker, label: s.label, bullets: s.bullets, left: s.left, right: s.right, stat: s.stat?.value, narration: s.narration },
    })),
  };
  const prompt = `Rewrite this production plan draft into a finished, professional plan.\n\nBRIEF (JSON):\n${JSON.stringify(brief, null, 2)}\n\nLayout notes: "split-compare" uses leftTitle/leftBody/rightTitle/rightBody; "checklist" uses bullets (max 5); "number-stat" and "price-offer" may set statValue only if the brief provides the number; "cta" label is the button text.`;
  return { system, prompt };
}

/** Merge validated LLM content into the structural skeleton. */
export function mergeLlmPlan(skeleton: ProductionPlan, llm: LlmPlan, generatedBy: string): ProductionPlan {
  const byId = new Map(llm.scenes.map((s) => [s.id, s]));
  const scenes = skeleton.scenes.map((s) => {
    const l = byId.get(s.id);
    if (!l) return s;
    const next = { ...s };
    next.headline = l.headline || s.headline;
    if (l.body !== undefined) next.body = l.body || undefined;
    if (l.kicker !== undefined && s.kicker !== undefined) next.kicker = l.kicker || s.kicker;
    if (l.label !== undefined && s.label !== undefined) next.label = l.label || s.label;
    if (l.bullets?.length && s.bullets) next.bullets = l.bullets.slice(0, 5);
    if (s.left && (l.leftTitle || l.leftBody)) next.left = { title: l.leftTitle || s.left.title, body: l.leftBody ?? s.left.body };
    if (s.right && (l.rightTitle || l.rightBody)) next.right = { title: l.rightTitle || s.right.title, body: l.rightBody ?? s.right.body };
    if (s.stat && typeof l.statValue === 'number' && Number.isFinite(l.statValue)) next.stat = { ...s.stat, value: l.statValue };
    next.narration = l.narration || composeNarration(next);
    next.shotDescription = l.shotDescription || s.shotDescription;
    next.visualPrompt = l.visualPrompt || s.visualPrompt;
    if (l.durationSec && l.durationSec >= 1 && l.durationSec <= 120) next.durationSec = Math.round(l.durationSec * 10) / 10;
    return next;
  });
  const plan: ProductionPlan = {
    ...skeleton,
    title: llm.title || skeleton.title,
    concept: llm.concept || skeleton.concept,
    hook: llm.hook || scenes[0]?.headline || skeleton.hook,
    visualDirection: llm.visualDirection || skeleton.visualDirection,
    music: { ...skeleton.music, direction: llm.musicDirection || skeleton.music.direction },
    rationale: [...llm.rationale.slice(0, 8), ...skeleton.rationale],
    scenes,
    generatedBy,
    createdAt: new Date().toISOString(),
  };
  plan.targetDurationSec = Math.round(scenes.reduce((n, s) => n + s.durationSec, 0) * 10) / 10;
  plan.requirements = estimateRequirements(plan);
  return plan;
}

export async function planWithLlm(
  skeleton: ProductionPlan, c: PlannerContext, llm: LlmAdapter, model: string, providerId: string, ctx: AdapterContext,
): Promise<{ plan: ProductionPlan; usage: { inputTokens: number; outputTokens: number } }> {
  const { system, prompt } = buildPlannerPrompt(skeleton, c);
  const res = await llm.generate({ system, prompt, model, jsonSchema: plannerJsonSchema(), maxTokens: 16000 }, ctx);
  let raw = res.json;
  if (raw === undefined) {
    const m = /\{[\s\S]*\}/.exec(res.text);
    if (m) { try { raw = JSON.parse(m[0]); } catch { /* fallthrough */ } }
  }
  const parsed = llmPlanSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Planner returned invalid JSON: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return { plan: mergeLlmPlan(skeleton, parsed.data, `${providerId}:${res.model || model}`), usage: res.usage };
}
