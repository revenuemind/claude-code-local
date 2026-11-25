/** Runtime validation for compositions coming from clients (editor saves, imports). */
import { z } from 'zod';
import type { Composition } from './types';

const ms = z.number().finite().min(0).max(4 * 60 * 60 * 1000);
const color = z.string().max(64).regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|transparent)$/);
const norm = z.number().finite().min(-2).max(3);

const easing = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'elasticOut', 'expoOut']);
const animation = z.object({
  type: z.enum(['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'zoom-in', 'zoom-out', 'wipe', 'blur', 'typewriter', 'words', 'rise-words']),
  durationMs: ms,
  easing: easing.optional(),
  delayMs: ms.optional(),
});
const transition = z.object({
  type: z.enum(['cut', 'crossfade', 'fade-black', 'fade-white', 'wipe-left', 'wipe-right', 'wipe-up', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'circle', 'flash']),
  durationMs: ms,
});
const box = z.object({ x: norm, y: norm, w: z.number().min(0).max(3), h: z.number().min(0).max(3) });
const transform = z.object({ x: norm.optional(), y: norm.optional(), scale: z.number().min(0).max(20).optional(), rotation: z.number().min(-3600).max(3600).optional() });
const keyframe = z.object({ at: z.number().min(0).max(1), scale: z.number().min(0.1).max(10), x: norm, y: norm });
const bgStyle = z.object({
  kind: z.enum(['solid', 'linear', 'radial', 'aurora', 'particles', 'grid', 'waves', 'bokeh', 'stripes', 'spotlight', 'mesh', 'rays', 'dots']),
  colors: z.array(color).min(1).max(8),
  angle: z.number().optional(), speed: z.number().min(0).max(10).optional(), seed: z.number().optional(),
  intensity: z.number().min(0).max(2).optional(), vignette: z.number().min(0).max(1).optional(), grain: z.number().min(0).max(1).optional(),
});
const textStyle = z.object({
  fontFamily: z.string().max(200), fontWeight: z.number().int().min(100).max(1000), fontSize: z.number().min(4).max(800),
  color, highlightColor: color.optional(), lineHeight: z.number().min(0.5).max(4).optional(), letterSpacing: z.number().min(-50).max(200).optional(),
  align: z.enum(['start', 'center', 'end']).optional(), valign: z.enum(['top', 'middle', 'bottom']).optional(), uppercase: z.boolean().optional(),
  stroke: z.object({ color, width: z.number().min(0).max(60) }).optional(),
  shadow: z.object({ color, blur: z.number().min(0).max(200), x: z.number().optional(), y: z.number().optional() }).optional(),
  background: z.object({ color, padding: z.number().min(0).max(300), radius: z.number().min(0).max(300), mode: z.enum(['box', 'line']).optional() }).optional(),
  maxLines: z.number().int().min(1).max(50).optional(), autoFit: z.boolean().optional(),
});
const mediaRef = z.object({ assetId: z.string().max(100).optional(), src: z.string().max(2000).optional() });
const placeholder = z.object({ label: z.string().max(200), prompt: z.string().max(4000).optional(), fallback: bgStyle.optional() });
const overlay = z.object({ color, opacity: z.number().min(0).max(1) });

const base = {
  id: z.string().min(1).max(100), start: ms, duration: ms.refine((d) => d > 0, 'duration must be > 0'),
  name: z.string().max(200).optional(), sceneId: z.string().max(100).optional(), opacity: z.number().min(0).max(1).optional(),
  transform: transform.optional(), enter: animation.optional(), exit: animation.optional(), transition: transition.optional(), locked: z.boolean().optional(),
};

const clip = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('background'), style: bgStyle }),
  z.object({ ...base, type: z.literal('image'), media: mediaRef, box, fit: z.enum(['cover', 'contain']), radius: z.number().min(0).optional(), kenBurns: z.object({ from: keyframe, to: keyframe }).optional(), placeholder: placeholder.optional(), overlay: overlay.optional() }),
  z.object({ ...base, type: z.literal('video'), media: mediaRef, box, fit: z.enum(['cover', 'contain']), trimIn: ms, speed: z.number().min(0.1).max(8), volume: z.number().min(0).max(2), muted: z.boolean().optional(), radius: z.number().min(0).optional(), sourceDurationMs: ms.optional(), placeholder: placeholder.optional(), overlay: overlay.optional() }),
  z.object({ ...base, type: z.literal('text'), text: z.string().max(5000), box, style: textStyle, counter: z.object({ from: z.number(), to: z.number(), decimals: z.number().int().min(0).max(6).optional() }).optional(), direction: z.enum(['auto', 'ltr', 'rtl']).optional() }),
  z.object({ ...base, type: z.literal('shape'), shape: z.enum(['rect', 'circle', 'line', 'progress', 'pill', 'ring', 'arrow', 'check', 'cross']), box, fill: color.optional(), stroke: z.object({ color, width: z.number().min(0).max(200) }).optional(), radius: z.number().min(0).optional(), animateProgress: z.boolean().optional() }),
  z.object({ ...base, type: z.literal('caption'), words: z.array(z.object({ text: z.string().max(200), start: ms, end: ms })).max(20000), box, preset: z.enum(['bold-pop', 'karaoke', 'minimal', 'boxed', 'neon']), style: textStyle, wordsPerLine: z.number().int().min(1).max(20).optional(), direction: z.enum(['auto', 'ltr', 'rtl']).optional() }),
  z.object({ ...base, type: z.literal('audio'), role: z.enum(['voiceover', 'music', 'sfx']), media: mediaRef, trimIn: ms, volume: z.number().min(0).max(2), fadeInMs: ms.optional(), fadeOutMs: ms.optional(), procedural: z.object({ kind: z.literal('music-bed'), mood: z.enum(['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic']), bpm: z.number().min(40).max(220), seed: z.number().optional() }).optional(), duckUnderVoice: z.boolean().optional(), text: z.string().max(20000).optional() }),
]);

const track = z.object({
  id: z.string().min(1).max(100), kind: z.enum(['visual', 'audio']), name: z.string().max(100),
  role: z.enum(['background', 'media', 'overlay', 'text', 'captions', 'brand', 'voiceover', 'music', 'sfx']).optional(),
  hidden: z.boolean().optional(), muted: z.boolean().optional(), locked: z.boolean().optional(), volume: z.number().min(0).max(2).optional(),
  clips: z.array(clip).max(2000),
});

export const compositionSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  fps: z.number().int().min(1).max(60),
  durationMs: ms.refine((d) => d > 0, 'duration must be > 0'),
  background: color,
  tracks: z.array(track).max(64),
  meta: z.object({
    title: z.string().max(300).optional(), language: z.string().max(20).optional(), direction: z.enum(['ltr', 'rtl']).optional(),
    templateId: z.string().max(100).optional(), aspect: z.string().max(20).optional(),
  }).optional(),
});

export function parseComposition(input: unknown): Composition {
  const parsed = compositionSchema.parse(input) as Composition;
  // Media `src` is resolved server-side from assetId at render time; never trust client paths.
  for (const t of parsed.tracks) for (const c of t.clips) if ('media' in c) delete c.media.src;
  return parsed;
}
