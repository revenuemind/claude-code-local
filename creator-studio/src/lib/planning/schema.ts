import { z } from 'zod';
import type { ProductionPlan } from './types';

const str = (max: number) => z.string().max(max);
const transition = z.enum(['cut', 'crossfade', 'fade-black', 'fade-white', 'wipe-left', 'wipe-right', 'wipe-up', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'circle', 'flash']);
const mood = z.enum(['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic']);

export const planSceneSchema = z.object({
  id: str(80).min(1),
  role: str(60),
  layout: str(40),
  durationSec: z.number().min(0.5).max(600),
  headline: str(500),
  body: str(2000).optional(),
  kicker: str(200).optional(),
  label: str(200).optional(),
  stat: z.object({ value: z.number().finite(), prefix: str(20).optional(), suffix: str(30).optional(), decimals: z.number().int().min(0).max(4).optional() }).optional(),
  bullets: z.array(str(300)).max(8).optional(),
  left: z.object({ title: str(300), body: str(1000).optional() }).optional(),
  right: z.object({ title: str(300), body: str(1000).optional() }).optional(),
  author: str(200).optional(),
  narration: str(5000),
  shotDescription: str(2000),
  visualPrompt: str(2000),
  mediaKind: z.enum(['none', 'image', 'video', 'avatar']),
  mediaMode: z.enum(['code', 'ai-image', 'ai-video', 'upload', 'avatar']),
  media: z.object({ assetId: str(100), kind: z.enum(['image', 'video']) }).nullable().optional(),
  transition: transition.optional(),
});

export const planSchema = z.object({
  version: z.literal(1),
  concept: str(2000),
  hook: str(1000),
  title: str(300),
  language: str(10),
  targetDurationSec: z.number().min(1).max(7200),
  scenes: z.array(planSceneSchema).min(1).max(200),
  visualDirection: str(2000),
  music: z.object({ mood, bpm: z.number().min(40).max(220), direction: str(1000), assetId: str(100).nullable().optional() }),
  voice: z.object({ enabled: z.boolean(), style: str(300), voiceId: str(100).nullable().optional(), providerId: str(60).nullable().optional() }),
  subtitles: z.object({ enabled: z.boolean(), preset: z.enum(['bold-pop', 'karaoke', 'minimal', 'boxed', 'neon']) }),
  rationale: z.array(str(1000)).max(30),
  requirements: z.object({
    aiImages: z.number(), aiVideoClips: z.number(), aiVideoSeconds: z.number(), voiceoverChars: z.number(), musicSeconds: z.number(), userMediaSlots: z.number(),
    missingAssets: z.array(str(500)),
  }),
  generatedBy: str(100),
  createdAt: str(40),
  voiceAssets: z.record(str(80), z.object({ assetId: str(100), durationMs: z.number().min(0).max(3_600_000), words: z.array(z.object({ text: str(200), start: z.number(), end: z.number() })).max(20000).optional() })).optional(),
});

export function parsePlan(x: unknown): ProductionPlan {
  return planSchema.parse(x) as ProductionPlan;
}

/** The subset an LLM fills in for each scene (structure stays template-driven). */
export const llmSceneSchema = z.object({
  id: z.string(),
  headline: z.string(),
  body: z.string().optional(),
  kicker: z.string().optional(),
  label: z.string().optional(),
  narration: z.string(),
  shotDescription: z.string(),
  visualPrompt: z.string(),
  bullets: z.array(z.string()).optional(),
  leftTitle: z.string().optional(),
  leftBody: z.string().optional(),
  rightTitle: z.string().optional(),
  rightBody: z.string().optional(),
  statValue: z.number().optional(),
  durationSec: z.number().optional(),
});
export const llmPlanSchema = z.object({
  title: z.string(),
  concept: z.string(),
  hook: z.string(),
  visualDirection: z.string(),
  musicDirection: z.string(),
  rationale: z.array(z.string()),
  scenes: z.array(llmSceneSchema),
});
export type LlmPlan = z.infer<typeof llmPlanSchema>;
