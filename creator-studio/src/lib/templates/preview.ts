/** Client-safe helpers to build preview compositions from a template's sample content. */
import type { Composition } from '../composition/types';
import type { Aspect, TemplateDefinition } from './types';
import { draftPlan, buildComposition } from './engine';

const cache = new Map<string, Composition>();

export function templatePreview(t: TemplateDefinition, aspect?: Aspect, opts: { voice?: boolean } = {}): Composition {
  const a = aspect ?? t.defaultAspect;
  const key = `${t.id}:${t.version}:${a}:${opts.voice ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const plan = draftPlan(t, t.sample, { language: 'en', mode: 'code', voiceover: opts.voice ?? false, captions: false, durationSec: Math.min(t.duration.default, 45) });
  const comp = buildComposition(plan, t, { aspect: a, fps: 30 });
  if (cache.size > 300) cache.clear();
  cache.set(key, comp);
  return comp;
}

/** A representative still time: 60% into the first scene with text. */
export function posterTime(comp: Composition): number {
  const first = comp.tracks.find((t) => t.role === 'background')?.clips[0];
  return first ? first.start + first.duration * 0.62 : 0;
}
