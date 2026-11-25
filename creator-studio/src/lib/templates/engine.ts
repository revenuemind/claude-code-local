/**
 * Template Engine.
 *
 *   template + user inputs ──draftPlan()──▶ ProductionPlan (editable, approvable)
 *   plan + template + brand + aspect ──buildComposition()──▶ Composition (editable timeline)
 *
 * Templates are pure data (see library.ts); adding a template never requires
 * engine changes. The offline planner is deterministic and needs no AI; an
 * LLM planner (planning/llm.ts) can produce the same ProductionPlan shape.
 */
import type {
  AudioClip, BackgroundClip, CaptionClip, Clip, Composition, ImageClip, MusicMood, Track, VideoClip, BackgroundStyle,
} from '../composition/types';
import type { PlanScene, ProductionMode, ProductionPlan, SceneMediaMode } from '../planning/types';
import type { Aspect, SceneBlueprint, StylePreset, TemplateDefinition } from './types';
import type { BrandKit } from '../brand/types';
import { getStyle } from './styles';
import { runLayout, captionBox, type Orientation } from './layouts';
import { phrase, wordsPerSecond, isRtlLanguage } from './phrases';
import { fontCovers, fontForLanguage } from '../render/fonts';
import { uid, withDuration } from '../composition/ops';
import { hashString, rng, withAlpha, mix } from '../render/util';

export const ASPECT_DIMENSIONS: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export function orientationOf(w: number, h: number): Orientation {
  if (h > w * 1.1) return 'vertical';
  if (w > h * 1.1) return 'landscape';
  return 'square';
}

// ───────────────────────── Inputs & interpolation ─────────────────────────

export interface ListItem { title: string; body?: string }

export function normalizeItems(value: unknown): ListItem[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split('\n');
  return arr
    .map((v): ListItem | null => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const title = String(o.title ?? o.text ?? '').trim();
        return title ? { title, body: o.body ? String(o.body).trim() : undefined } : null;
      }
      const s = String(v ?? '').trim();
      if (!s) return null;
      const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(s) ?? /^([^:]{2,80}):\s+(.+)$/.exec(s);
      return m ? { title: m[1].trim(), body: m[2].trim() } : { title: s };
    })
    .filter((x): x is ListItem => !!x);
}

export function interpolate(tpl: string | undefined, vars: Record<string, unknown>, lang: string): string {
  if (!tpl) return '';
  return tpl.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_, key: string, fallback?: string) => {
    if (key.startsWith('t:')) return phrase(key.slice(2), lang);
    const path = key.split('.');
    let v: unknown = vars;
    for (const p of path) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[p] : undefined;
    const s = v === undefined || v === null ? '' : String(v).trim();
    if (s) return s;
    if (fallback?.startsWith('t:')) return phrase(fallback.slice(2), lang);
    return fallback ?? '';
  }).replace(/\s{2,}/g, ' ').trim();
}

// ───────────────────────── Offline planner ─────────────────────────

export interface DraftOptions {
  language: string;
  durationSec?: number;
  mode: ProductionMode;
  audience?: string;
  objective?: string;
  captions?: boolean;
  voiceover?: boolean;
}

function defaultMediaMode(kind: PlanScene['mediaKind'], mode: ProductionMode, index: number, role: string): SceneMediaMode {
  if (kind === 'none') return 'code';
  if (kind === 'avatar') return mode === 'code' ? 'upload' : 'avatar';
  if (mode === 'code') return 'code';
  if (mode === 'ai') return kind === 'video' ? 'ai-video' : 'ai-image';
  // hybrid: motion where it matters most (hook / video scenes), stills elsewhere.
  if (kind === 'video' && (index === 0 || role === 'hook' || role === 'hero')) return 'ai-video';
  return 'ai-image';
}

/** Narration covering everything a scene shows (headline, body, comparisons, bullets). */
export function composeNarration(s: Pick<PlanScene, 'headline' | 'body' | 'left' | 'right' | 'bullets' | 'author'>): string {
  const parts = [s.headline, s.body];
  if (s.left) parts.push([s.left.title, s.left.body].filter(Boolean).join(': '));
  if (s.right) parts.push([s.right.title, s.right.body].filter(Boolean).join(': '));
  if (s.bullets?.length) parts.push(s.bullets.join(', '));
  if (s.author) parts.push(s.author);
  return parts.filter((x) => x && x.trim()).map((x) => x!.replace(/\*/g, '').trim().replace(/[.!?。]$/, '')).join('. ') + '.';
}

function narrationFor(bp: SceneBlueprint, vars: Record<string, unknown>, lang: string, headline: string, body: string): string {
  if (bp.narration) return interpolate(bp.narration, vars, lang);
  return [headline, body].filter(Boolean).map((s) => s.replace(/\*/g, '')).join('. ').replace(/\.\./g, '.');
}

export function draftPlan(t: TemplateDefinition, inputs: Record<string, unknown>, opts: DraftOptions): ProductionPlan {
  const lang = opts.language || 'en';
  const target = Math.min(t.duration.max, Math.max(t.duration.min, opts.durationSec ?? t.duration.default));
  const listFields = Object.fromEntries(t.fields.filter((f) => f.type === 'list').map((f) => [f.key, normalizeItems(inputs[f.key])]));
  const base: Record<string, unknown> = { ...inputs, audience: opts.audience ?? inputs.audience ?? '', objective: opts.objective ?? '' };

  // Expand blueprints (repeat for list items).
  const expanded: Array<{ bp: SceneBlueprint; vars: Record<string, unknown> }> = [];
  for (const bp of t.scenes) {
    if (bp.repeat) {
      let items = listFields[bp.repeat.field] ?? normalizeItems(inputs[bp.repeat.field]);
      items = items.slice(0, bp.repeat.max);
      const count = items.length;
      items.forEach((item, i) => {
        // `n` counts up from 1; `rank` counts down from `count` (for countdowns).
        const vars = { ...base, item, n: i + 1, rank: count - i, count };
        expanded.push({ bp, vars });
        for (const sub of bp.then ?? []) expanded.push({ bp: sub, vars });
      });
    } else {
      expanded.push({ bp, vars: { ...base, count: Object.values(listFields)[0]?.length ?? 0 } });
    }
  }

  const voiceEnabled = opts.voiceover ?? (t.requirements.voiceover === 'required' || t.requirements.voiceover === 'recommended');
  const totalWeight = expanded.reduce((s, e) => s + e.bp.weight, 0) || 1;
  const wps = wordsPerSecond(lang);
  const scenes: PlanScene[] = expanded.map(({ bp, vars }, index) => {
    const headline = interpolate(bp.headline, vars, lang);
    const body = interpolate(bp.body, vars, lang);
    const kicker = interpolate(bp.kicker, vars, lang);
    const label = interpolate(bp.label, vars, lang);
    const narration = narrationFor(bp, vars, lang, headline, body);
    const mediaKind = bp.media ?? 'none';
    const scene: PlanScene = {
      id: `s${index + 1}_${hashString(bp.role + index + headline).toString(36).slice(0, 5)}`,
      role: bp.role,
      layout: bp.layout,
      durationSec: 0,
      headline, body: body || undefined, kicker: kicker || undefined, label: label || undefined,
      narration,
      shotDescription: interpolate(bp.visualPrompt, vars, 'en') || `${bp.layout} scene: ${headline}`,
      visualPrompt: interpolate(bp.visualPrompt, vars, 'en'),
      mediaKind,
      mediaMode: defaultMediaMode(mediaKind, opts.mode, index, bp.role),
      media: null,
      transition: bp.transition,
    };
    const extra = bp.extra ?? {};
    if (extra.statValue) {
      const raw = interpolate(extra.statValue, vars, lang);
      const num = parseFloat(raw.replace(/[^\d.\-]/g, ''));
      if (!Number.isNaN(num)) scene.stat = { value: num, prefix: interpolate(extra.statPrefix, vars, lang) || undefined, suffix: interpolate(extra.statSuffix, vars, lang) || undefined, decimals: raw.includes('.') ? 1 : 0 };
    }
    if (extra.leftTitle || extra.rightTitle) {
      scene.left = { title: interpolate(extra.leftTitle, vars, lang), body: interpolate(extra.leftBody, vars, lang) || undefined };
      scene.right = { title: interpolate(extra.rightTitle, vars, lang), body: interpolate(extra.rightBody, vars, lang) || undefined };
    }
    if (extra.author) scene.author = interpolate(extra.author, vars, lang) || undefined;
    if (extra.bullets) scene.bullets = normalizeItems(vars[extra.bullets] ?? inputs[extra.bullets]).map((i) => i.title).slice(0, 5);
    if (!bp.narration) scene.narration = composeNarration(scene);
    const share = (target * bp.weight) / totalWeight;
    const needed = scene.narration.split(/\s+/).filter(Boolean).length / wps + 0.7;
    scene.durationSec = Math.round(Math.max(1.8, share, voiceEnabled ? needed : 0) * 10) / 10;
    return scene;
  });

  // Keep the total within the template's limits.
  const total = scenes.reduce((s, x) => s + x.durationSec, 0);
  if (total > t.duration.max) {
    const f = t.duration.max / total;
    scenes.forEach((s) => { s.durationSec = Math.round(Math.max(1.5, s.durationSec * f) * 10) / 10; });
  }

  const title = interpolate(String(inputs.title ?? inputs.topic ?? inputs.product ?? inputs.headline ?? ''), {}, lang) || scenes[0]?.headline || t.name.en;
  const plan: ProductionPlan = {
    version: 1,
    concept: `${t.name.en}: ${title}`,
    hook: scenes[0]?.headline ?? '',
    title,
    language: lang,
    targetDurationSec: Math.round(scenes.reduce((s, x) => s + x.durationSec, 0) * 10) / 10,
    scenes,
    visualDirection: `${getStyle(t.style).name} style — ${t.tags.slice(0, 4).join(', ')}`,
    music: { mood: t.music.mood, bpm: t.music.bpm, direction: `${t.music.mood} bed at ~${t.music.bpm} BPM`, assetId: null },
    voice: { enabled: voiceEnabled, style: 'natural, confident', voiceId: null, providerId: null },
    // Captions mirror narration; without a voice they would only duplicate on-screen text.
    subtitles: { enabled: opts.captions ?? (t.captions.enabled && voiceEnabled), preset: t.captions.preset ?? getStyle(t.style).captionPreset },
    rationale: [],
    requirements: { aiImages: 0, aiVideoClips: 0, aiVideoSeconds: 0, voiceoverChars: 0, musicSeconds: 0, userMediaSlots: 0, missingAssets: [] },
    generatedBy: 'offline-template-planner',
    createdAt: new Date().toISOString(),
  };
  plan.rationale = explainPlan(plan, t, opts);
  plan.requirements = estimateRequirements(plan);
  return plan;
}

export function explainPlan(plan: ProductionPlan, t: TemplateDefinition, opts: DraftOptions): string[] {
  const r: string[] = [];
  r.push(`Structure follows the “${t.name.en}” template: ${plan.scenes.length} scenes, ~${Math.round(plan.targetDurationSec)}s (template range ${t.duration.min}–${t.duration.max}s).`);
  if (opts.mode === 'hybrid') r.push('Hybrid mode: AI video only for the hook / motion-critical scenes, AI stills (with Ken Burns motion) elsewhere, to balance quality and cost.');
  if (opts.mode === 'code') r.push('Code-only mode: media slots render as procedural motion backgrounds; no external AI calls or costs.');
  if (opts.mode === 'ai') r.push('AI mode: every media slot is generated by the selected AI engines.');
  if (plan.voice.enabled) r.push('Voiceover enabled: scene durations were extended where narration needs more time.');
  if (plan.subtitles.enabled) r.push(`Captions use the “${plan.subtitles.preset}” preset — most short-form viewers watch muted.`);
  if (isRtlLanguage(plan.language)) r.push('Right-to-left content: layouts mirror side-by-side elements and text is shaped RTL.');
  return r;
}

export function estimateRequirements(plan: ProductionPlan): ProductionPlan['requirements'] {
  const req = { aiImages: 0, aiVideoClips: 0, aiVideoSeconds: 0, voiceoverChars: 0, musicSeconds: 0, userMediaSlots: 0, missingAssets: [] as string[] };
  for (const s of plan.scenes) {
    if (s.mediaKind === 'none') continue;
    if (s.mediaMode === 'ai-image') req.aiImages++;
    if (s.mediaMode === 'ai-video' || s.mediaMode === 'avatar') { const n = Math.ceil(s.durationSec / 8); req.aiVideoClips += n; req.aiVideoSeconds += Math.min(n * 8, Math.ceil(s.durationSec)); }
    if (s.mediaMode === 'upload') req.userMediaSlots++;
    if (s.mediaMode !== 'code' && !s.media) req.missingAssets.push(`${s.id}: ${s.mediaMode} (${s.headline.slice(0, 40)})`);
  }
  if (plan.voice.enabled) req.voiceoverChars = plan.scenes.reduce((n, s) => n + s.narration.length, 0);
  return req;
}

// ───────────────────────── Style resolution ─────────────────────────

export function resolveStyle(t: TemplateDefinition, brand: BrandKit | null | undefined, lang: string, styleId?: string | null): StylePreset {
  const base = getStyle(styleId || t.style);
  const st: StylePreset = { ...base, ...(t.styleOverrides ?? {}), palette: { ...base.palette, ...(t.styleOverrides?.palette ?? {}) } };
  if (brand) {
    st.palette = {
      ...st.palette,
      primary: brand.colors.primary, accent: brand.colors.accent, bg: brand.colors.background,
      surface: mix(brand.colors.background, brand.colors.secondary, 0.35), text: brand.colors.text,
      muted: mix(brand.colors.text, brand.colors.background, 0.25),
    };
    if (brand.fonts.heading) st.headingFont = brand.fonts.heading;
    if (brand.fonts.body) st.bodyFont = brand.fonts.body;
  }
  if (!fontCovers(st.headingFont, lang)) st.headingFont = fontForLanguage(lang, 'heading') ?? st.headingFont;
  if (!fontCovers(st.bodyFont, lang)) st.bodyFont = fontForLanguage(lang, 'body') ?? st.bodyFont;
  if (['he', 'ar', 'am'].includes(lang)) { st.uppercaseHeadings = false; if (st.headingWeight < 700) st.headingWeight = 800; }
  return st;
}

function sceneBackground(st: StylePreset, i: number): BackgroundStyle {
  const p = st.palette;
  const variants = [
    [p.bg, p.surface, p.primary, p.accent],
    [p.bg, mix(p.surface, p.primary, 0.25), p.accent, p.primary],
    [mix(p.bg, p.surface, 0.5), p.bg, p.primary, p.accent],
  ];
  return {
    kind: st.background.kind,
    colors: st.background.colors ?? variants[i % variants.length],
    angle: (st.background.angle ?? 135) + i * 25,
    speed: st.background.speed, seed: 11 + i * 7, intensity: st.background.intensity,
    vignette: st.background.vignette, grain: st.background.grain,
  };
}

// ───────────────────────── Captions timing ─────────────────────────

/** Estimate word timings across a span (weighted by word length). */
export function estimateWordTimings(text: string, spanMs: number, offsetMs = 0): CaptionClip['words'] {
  const words = text.replace(/\*/g, '').split(/\s+/).filter(Boolean);
  if (!words.length || spanMs <= 0) return [];
  const weights = words.map((w) => 0.6 + Math.min(14, Array.from(w).length) * 0.12 + (/[.,!?;:،。]$/.test(w) ? 0.45 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = offsetMs;
  return words.map((w, i) => {
    const d = (weights[i] / total) * spanMs;
    const out = { text: w, start: Math.round(t), end: Math.round(t + d) };
    t += d;
    return out;
  });
}

// ───────────────────────── Composition builder ─────────────────────────

export interface BuildOptions {
  aspect: Aspect;
  width?: number;
  height?: number;
  fps?: number;
  brand?: BrandKit | null;
  styleId?: string | null;
  /** Per-scene voiceover assets (from TTS) with their exact duration and optional word timings. */
  voice?: Record<string, { assetId: string; durationMs: number; words?: CaptionClip['words'] }>;
  musicAssetId?: string | null;
  musicDurationMs?: number | null;
}

export function buildComposition(plan: ProductionPlan, t: TemplateDefinition, opts: BuildOptions): Composition {
  const dims = ASPECT_DIMENSIONS[opts.aspect] ?? ASPECT_DIMENSIONS['9:16'];
  const W = opts.width ?? dims.width; const H = opts.height ?? dims.height;
  const orientation = orientationOf(W, H);
  const st = resolveStyle(t, opts.brand, plan.language, opts.styleId);
  const dir = isRtlLanguage(plan.language) ? 'rtl' : 'ltr';
  const captions = plan.subtitles.enabled;

  const tracks: Record<string, Track> = {
    bg: { id: 'trk_bg', kind: 'visual', name: 'Background', role: 'background', clips: [] },
    media: { id: 'trk_media', kind: 'visual', name: 'Media', role: 'media', clips: [] },
    overlay: { id: 'trk_overlay', kind: 'visual', name: 'Graphics', role: 'overlay', clips: [] },
    text: { id: 'trk_text', kind: 'visual', name: 'Text', role: 'text', clips: [] },
    captions: { id: 'trk_captions', kind: 'visual', name: 'Captions', role: 'captions', clips: [] },
    brand: { id: 'trk_brand', kind: 'visual', name: 'Brand', role: 'brand', clips: [] },
    voice: { id: 'trk_voice', kind: 'audio', name: 'Voiceover', role: 'voiceover', clips: [] },
    music: { id: 'trk_music', kind: 'audio', name: 'Music', role: 'music', clips: [] },
  };

  let cursor = 0;
  const R = rng(hashString(plan.title || 'x'));
  plan.scenes.forEach((scene, i) => {
    const voice = opts.voice?.[scene.id];
    const durMs = Math.round(Math.max(scene.durationSec * 1000, voice ? voice.durationMs + 500 : 0));
    const start = cursor;
    const transition = i === 0 ? undefined : { type: scene.transition ?? st.transition, durationMs: Math.min(st.transitionMs, durMs * 0.4) };
    const bg: BackgroundClip = { id: uid('bg'), type: 'background', name: `Scene ${i + 1} background`, sceneId: scene.id, start, duration: durMs, style: sceneBackground(st, i), transition };
    tracks.bg.clips.push(bg);

    // Code-only scenes without an attached asset use the text-forward variant of the layout.
    const eff: PlanScene = scene.mediaMode === 'code' && !scene.media ? { ...scene, mediaKind: 'none' } : scene;
    const out = runLayout(scene.layout as never, eff, { W, H, orientation, start, duration: durMs, style: st, sceneIndex: i, sceneCount: plan.scenes.length, dir, captions });
    if (out.media && eff.mediaKind !== 'none') {
      const isVideo = scene.media?.kind === 'video' || (!scene.media && (scene.mediaMode === 'ai-video' || scene.mediaMode === 'avatar'));
      const full = out.media.box.w >= 0.99 && out.media.box.h >= 0.99;
      const fallback = { ...sceneBackground(st, i + 1), kind: scene.mediaMode === 'code' ? st.background.kind : 'mesh' as const };
      const placeholder = { label: `${scene.mediaMode === 'code' ? 'Procedural' : scene.mediaMode} · ${scene.role}`, prompt: scene.visualPrompt, fallback };
      const common = {
        id: uid('md'), name: `Scene ${i + 1} ${isVideo ? 'video' : 'image'}`, sceneId: scene.id, start, duration: durMs,
        media: { assetId: scene.media?.assetId }, box: out.media.box, fit: out.media.fit, radius: out.media.radius,
        placeholder, overlay: out.media.overlay ? { color: '#000000', opacity: out.media.overlay } : undefined,
        transition: full ? transition : undefined,
        enter: full ? undefined : { type: 'zoom-in' as const, durationMs: 600 },
        exit: full ? undefined : { type: 'fade' as const, durationMs: 250 },
      };
      if (isVideo) {
        tracks.media.clips.push({ ...common, type: 'video', trimIn: 0, speed: 1, volume: 0, muted: true } as VideoClip);
      } else {
        const z = R() > 0.5;
        tracks.media.clips.push({
          ...common, type: 'image',
          kenBurns: out.media.kenBurns ? { from: { at: 0, scale: z ? 1.0 : 1.14, x: 0, y: 0 }, to: { at: 1, scale: z ? 1.14 : 1.0, x: (R() - 0.5) * 0.06, y: (R() - 0.5) * 0.04 } } : undefined,
        } as ImageClip);
      }
    }
    tracks.overlay.clips.push(...out.overlay);
    tracks.text.clips.push(...out.text);

    if (captions && scene.narration) {
      const speechStart = 150;
      const span = voice ? voice.durationMs : Math.max(400, Math.min(durMs - 300, (scene.narration.split(/\s+/).length / wordsPerSecond(plan.language)) * 1000));
      const words = voice?.words?.length ? voice.words.map((w) => ({ ...w, start: w.start + speechStart, end: w.end + speechStart })) : estimateWordTimings(scene.narration, span, speechStart);
      const cap: CaptionClip = {
        id: uid('cp'), type: 'caption', name: `Scene ${i + 1} captions`, sceneId: scene.id, start, duration: durMs,
        words: words.filter((w) => w.start < durMs), box: captionBox(orientation), preset: plan.subtitles.preset,
        wordsPerLine: orientation === 'landscape' ? 6 : 3,
        style: {
          fontFamily: st.bodyFont === 'Inter' ? st.headingFont : st.bodyFont, fontWeight: 800, fontSize: orientation === 'landscape' ? 58 : 72,
          color: '#ffffff', highlightColor: st.palette.accent, align: 'center', valign: 'middle', lineHeight: 1.15, autoFit: true,
          stroke: plan.subtitles.preset === 'boxed' ? undefined : { color: 'rgba(0,0,0,0.85)', width: 10 },
          shadow: { color: 'rgba(0,0,0,0.6)', blur: 14, y: 3 },
          uppercase: plan.subtitles.preset === 'bold-pop' && !['he', 'ar', 'am'].includes(plan.language),
        },
      };
      if (cap.words.length) tracks.captions.clips.push(cap);
    }
    if (voice) {
      tracks.voice.clips.push({ id: uid('vo'), type: 'audio', role: 'voiceover', name: `Scene ${i + 1} voice`, sceneId: scene.id, start: start + 150, duration: voice.durationMs, media: { assetId: voice.assetId }, trimIn: 0, volume: 1, text: scene.narration } as AudioClip);
    }
    cursor += durMs;
  });

  const total = cursor;
  if (opts.brand?.logoAssetId) {
    const s = orientation === 'landscape' ? 0.08 : 0.14;
    tracks.brand.clips.push({
      id: uid('lg'), type: 'image', name: 'Logo', start: 0, duration: total, media: { assetId: opts.brand.logoAssetId },
      box: { x: dir === 'rtl' ? 0.04 : 1 - 0.04 - s, y: 0.035, w: s, h: s * W / H }, fit: 'contain', opacity: 0.9,
      enter: { type: 'fade', durationMs: 500 },
    } as ImageClip);
  }
  const hasVoice = tracks.voice.clips.length > 0;
  const music: AudioClip = {
    id: uid('mu'), type: 'audio', role: 'music', name: 'Music', start: 0, duration: total, trimIn: 0,
    volume: hasVoice ? 0.28 : 0.6, fadeInMs: 800, fadeOutMs: 1500, duckUnderVoice: hasVoice,
    media: { assetId: opts.musicAssetId ?? plan.music.assetId ?? undefined },
    procedural: opts.musicAssetId || plan.music.assetId ? undefined : { kind: 'music-bed', mood: plan.music.mood as MusicMood, bpm: plan.music.bpm, seed: hashString(plan.title) % 1000 },
  };
  tracks.music.clips.push(music);

  const ordered = [tracks.bg, tracks.media, tracks.overlay, tracks.text, tracks.captions, tracks.brand, tracks.voice, tracks.music];
  return withDuration({
    version: 1, width: W, height: H, fps: opts.fps ?? 30, durationMs: total, background: st.palette.bg,
    tracks: ordered,
    meta: { title: plan.title, language: plan.language, direction: dir, templateId: t.id, aspect: opts.aspect },
  });
}

/** Re-target an existing composition to a new canvas size (normalized geometry scales automatically). */
export function retarget(comp: Composition, width: number, height: number): Composition {
  return { ...comp, width, height, meta: { ...comp.meta, aspect: `${width}x${height}` } };
}

export { withAlpha };
export type { Clip };
