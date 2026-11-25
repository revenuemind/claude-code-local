/** Validation for user-made templates (Template Editor, import/export). */
import { z } from 'zod';
import type { TemplateDefinition } from './types';
import { LAYOUT_IDS } from './layouts';
import { STYLES } from './styles';

const lt = z.object({ en: z.string().min(1).max(200), he: z.string().max(200).optional(), ru: z.string().max(200).optional(), ar: z.string().max(200).optional(), am: z.string().max(200).optional() });
const ltLong = z.object({ en: z.string().min(1).max(1000), he: z.string().max(1000).optional(), ru: z.string().max(1000).optional(), ar: z.string().max(1000).optional(), am: z.string().max(1000).optional() });
const tpl = z.string().max(1000).optional();

const blueprint: z.ZodType<TemplateDefinition['scenes'][number]> = z.lazy(() => z.object({
  role: z.string().min(1).max(60),
  layout: z.enum(LAYOUT_IDS as [string, ...string[]]),
  weight: z.number().min(0.1).max(20),
  repeat: z.object({ field: z.string().max(60), min: z.number().int().min(0).max(50), max: z.number().int().min(1).max(50) }).optional(),
  headline: tpl, body: tpl, kicker: tpl, label: tpl, narration: tpl, visualPrompt: tpl,
  media: z.enum(['none', 'image', 'video', 'avatar']).optional(),
  transition: z.enum(['cut', 'crossfade', 'fade-black', 'fade-white', 'wipe-left', 'wipe-right', 'wipe-up', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'circle', 'flash']).optional(),
  extra: z.record(z.string().max(60), z.string().max(500)).optional(),
  then: z.array(blueprint).max(5).optional(),
})) as z.ZodType<TemplateDefinition['scenes'][number]>;

export const templateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'id must be lowercase letters, digits and dashes'),
  version: z.number().int().min(1).max(10000),
  category: z.enum(['social', 'marketing', 'longform', 'faceless', 'influencer']),
  name: lt,
  description: ltLong,
  tags: z.array(z.string().max(40)).max(20),
  platforms: z.array(z.enum(['youtube', 'shorts', 'tiktok', 'instagram', 'facebook'])).max(5),
  defaultAspect: z.enum(['9:16', '16:9', '1:1', '4:5']),
  aspects: z.array(z.enum(['9:16', '16:9', '1:1', '4:5'])).min(1),
  duration: z.object({ min: z.number().min(1).max(7200), max: z.number().min(1).max(7200), default: z.number().min(1).max(7200) }).refine((d) => d.min <= d.default && d.default <= d.max, 'duration must satisfy min ≤ default ≤ max'),
  modes: z.array(z.enum(['code', 'ai', 'hybrid'])).min(1),
  recommendedMode: z.enum(['code', 'ai', 'hybrid']),
  requirements: z.object({
    voiceover: z.enum(['none', 'optional', 'recommended', 'required']),
    aiImages: z.enum(['optional', 'recommended', 'required']).optional(),
    aiVideo: z.enum(['optional', 'recommended', 'required']).optional(),
    avatar: z.enum(['optional', 'required']).optional(),
    userMedia: z.enum(['optional', 'recommended']).optional(),
  }),
  style: z.string().refine((s) => s in STYLES, 'unknown style preset'),
  styleOverrides: z.record(z.string(), z.unknown()).optional(),
  fields: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z][\w]{0,39}$/), type: z.enum(['text', 'textarea', 'list', 'number', 'url']), label: lt,
    required: z.boolean().optional(), placeholder: z.string().max(200).optional(), maxItems: z.number().int().min(1).max(50).optional(),
  })).max(30),
  scenes: z.array(blueprint).min(1).max(40),
  music: z.object({ mood: z.enum(['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic']), bpm: z.number().min(40).max(220) }),
  captions: z.object({ enabled: z.boolean(), preset: z.enum(['bold-pop', 'karaoke', 'minimal', 'boxed', 'neon']).optional() }),
  sample: z.record(z.string(), z.unknown()),
});

export function parseTemplate(x: unknown): TemplateDefinition {
  const t = templateSchema.parse(x) as TemplateDefinition;
  return t;
}
