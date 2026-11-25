/**
 * Scene layouts: functions that turn a plan scene's content into positioned,
 * animated clips. Layouts adapt to vertical / landscape / square canvases and
 * to RTL content, and keep a band free for captions when they are enabled.
 */
import type { Box, Clip, EnterExitType, ShapeClip, TextClip, TextStyle } from '../composition/types';
import type { PlanScene } from '../planning/types';
import type { LayoutId, StylePreset } from './types';
import { uid } from '../composition/ops';
import { withAlpha } from '../render/util';

export type Orientation = 'vertical' | 'landscape' | 'square';

export interface LayoutContext {
  W: number; H: number;
  orientation: Orientation;
  start: number; duration: number;
  style: StylePreset;
  sceneIndex: number; sceneCount: number;
  dir: 'ltr' | 'rtl';
  captions: boolean;
}

export interface LayoutOutput {
  media?: { box: Box; radius?: number; fit: 'cover' | 'contain'; overlay?: number; kenBurns?: boolean; circle?: boolean };
  overlay: Clip[];
  text: Clip[];
}

export function contentArea(o: Orientation, captions: boolean): Box {
  if (o === 'vertical') return { x: 0.08, y: 0.1, w: 0.84, h: captions ? 0.56 : 0.76 };
  if (o === 'landscape') return { x: 0.07, y: 0.1, w: 0.86, h: captions ? 0.64 : 0.8 };
  return { x: 0.08, y: 0.08, w: 0.84, h: captions ? 0.64 : 0.82 };
}

export function captionBox(o: Orientation): Box {
  if (o === 'vertical') return { x: 0.07, y: 0.69, w: 0.86, h: 0.13 };
  if (o === 'landscape') return { x: 0.12, y: 0.78, w: 0.76, h: 0.14 };
  return { x: 0.07, y: 0.76, w: 0.86, h: 0.14 };
}

const sub = (a: Box, fx: number, fy: number, fw: number, fh: number): Box => ({ x: a.x + a.w * fx, y: a.y + a.h * fy, w: a.w * fw, h: a.h * fh });
/** Mirror a box horizontally (for RTL side-by-side layouts). */
const mirror = (b: Box, rtl: boolean): Box => (rtl ? { ...b, x: 1 - b.x - b.w } : b);

class Builder {
  overlay: Clip[] = [];
  text: Clip[] = [];
  constructor(private c: LayoutContext, private sceneId: string) {}

  private heading(size: number, extra: Partial<TextStyle> = {}): TextStyle {
    const s = this.c.style;
    return {
      fontFamily: s.headingFont, fontWeight: s.headingWeight, fontSize: size, color: s.palette.text,
      highlightColor: s.palette.accent, lineHeight: 1.08, align: 'center', valign: 'middle',
      uppercase: s.uppercaseHeadings, autoFit: true,
      shadow: s.textShadow ? { color: 'rgba(0,0,0,0.55)', blur: 18, y: 4 } : undefined,
      ...extra,
    };
  }
  private body(size: number, extra: Partial<TextStyle> = {}): TextStyle {
    const s = this.c.style;
    return {
      fontFamily: s.bodyFont, fontWeight: s.bodyWeight, fontSize: size, color: s.palette.muted,
      highlightColor: s.palette.accent, lineHeight: 1.3, align: 'center', valign: 'middle', autoFit: true,
      shadow: s.textShadow ? { color: 'rgba(0,0,0,0.5)', blur: 12, y: 2 } : undefined,
      ...extra,
    };
  }

  private timing(order: number, enter?: EnterExitType) {
    const c = this.c;
    const delay = Math.min(order * 160, c.duration * 0.35);
    const type = enter ?? c.style.textEnter;
    const dur = type === 'typewriter' || type === 'words' || type === 'rise-words' ? Math.min(1400, c.duration * 0.45) : 550;
    return {
      start: c.start, duration: c.duration, sceneId: this.sceneId,
      enter: { type, durationMs: dur, delayMs: delay },
      exit: { type: 'fade' as const, durationMs: Math.min(260, c.duration * 0.15) },
    };
  }

  addText(name: string, text: string | undefined, box: Box, style: TextStyle, order: number, enter?: EnterExitType, counter?: TextClip['counter']) {
    if (!text || !text.trim()) return;
    this.text.push({ id: uid('tx'), type: 'text', name, text, box, style, counter, ...this.timing(order, enter) });
  }
  heading$(name: string, text: string | undefined, box: Box, size: number, order = 0, extra: Partial<TextStyle> = {}, enter?: EnterExitType) {
    this.addText(name, text, box, this.heading(size, extra), order, enter);
  }
  body$(name: string, text: string | undefined, box: Box, size: number, order = 1, extra: Partial<TextStyle> = {}, enter?: EnterExitType) {
    this.addText(name, text, box, this.body(size, extra), order, enter ?? 'fade');
  }
  counter$(name: string, scene: PlanScene, box: Box, size: number, order = 0) {
    if (!scene.stat) return;
    const tpl = `${scene.stat.prefix ?? ''}{n}${scene.stat.suffix ?? ''}`;
    this.addText(name, tpl, box, this.heading(size, { color: this.c.style.palette.accent }), order, 'pop', { from: 0, to: scene.stat.value, decimals: scene.stat.decimals });
  }
  shape(name: string, shape: ShapeClip['shape'], box: Box, props: Partial<ShapeClip> = {}, order = 0, enter: EnterExitType = 'fade') {
    this.overlay.push({ id: uid('sh'), type: 'shape', name, shape, box, ...this.timing(order, enter), ...props } as ShapeClip);
  }
}

type LayoutFn = (scene: PlanScene, c: LayoutContext, b: Builder) => LayoutOutput['media'] | undefined;

const isV = (c: LayoutContext) => c.orientation === 'vertical';
const isL = (c: LayoutContext) => c.orientation === 'landscape';

const L: Record<LayoutId, LayoutFn> = {
  title(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    b.body$('Kicker', sc.kicker, sub(a, 0, 0.12, 1, 0.1), 40, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true, letterSpacing: 4 });
    b.heading$('Headline', sc.headline, sub(a, 0, 0.22, 1, 0.42), isL(c) ? 104 : 118, 1);
    b.body$('Body', sc.body, sub(a, 0.04, 0.68, 0.92, 0.22), 46, 2);
    return sc.mediaKind !== 'none' ? { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: Math.max(0.45, c.style.mediaOverlay ?? 0.4), kenBurns: true } : undefined;
  },
  statement(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    b.heading$('Statement', sc.headline, sub(a, 0, 0.1, 1, 0.6), isL(c) ? 120 : 132, 0, {}, 'words');
    b.body$('Body', sc.body, sub(a, 0.06, 0.74, 0.88, 0.2), 44, 2);
    return sc.mediaKind !== 'none' ? { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.55, kenBurns: true } : undefined;
  },
  'list-item'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const num = sc.label ?? String(c.sceneIndex);
    const hasMedia = sc.mediaKind !== 'none';
    if (isL(c) && hasMedia) {
      const textSide = mirror(sub(a, 0, 0, 0.48, 1), c.dir === 'rtl');
      b.shape('Badge', 'circle', { x: textSide.x + textSide.w / 2 - 0.045, y: a.y + a.h * 0.02, w: 0.09, h: 0.16 }, { fill: c.style.palette.primary }, 0, 'pop');
      b.heading$('Number', num, { x: textSide.x + textSide.w / 2 - 0.045, y: a.y + a.h * 0.02, w: 0.09, h: 0.16 }, 84, 0, { color: c.style.palette.bg, shadow: undefined }, 'pop');
      b.heading$('Title', sc.headline, sub(textSide, 0, 0.26, 1, 0.38), 84, 1);
      b.body$('Body', sc.body, sub(textSide, 0, 0.66, 1, 0.3), 40, 2);
      return { box: mirror(sub(a, 0.53, 0.02, 0.47, 0.96), c.dir === 'rtl'), fit: 'cover', radius: c.style.radius, kenBurns: true };
    }
    const bs = Math.min(c.W, c.H) * (isV(c) ? 0.17 : 0.15);
    const badge: Box = { x: 0.5 - bs / c.W / 2, y: a.y, w: bs / c.W, h: bs / c.H };
    b.shape('Badge', 'circle', badge, { fill: c.style.palette.primary }, 0, 'pop');
    b.heading$('Number', num, badge, 92, 0, { color: c.style.palette.bg, shadow: undefined }, 'pop');
    if (hasMedia) {
      b.heading$('Title', sc.headline, sub(a, 0, 0.62, 1, 0.2), 84, 1);
      b.body$('Body', sc.body, sub(a, 0.04, 0.83, 0.92, 0.17), 40, 2);
      return { box: sub(a, 0.04, isV(c) ? 0.2 : 0.3, 0.92, isV(c) ? 0.4 : 0.32), fit: 'cover', radius: c.style.radius, kenBurns: true };
    }
    b.heading$('Title', sc.headline, sub(a, 0, 0.26, 1, 0.4), 104, 1);
    b.body$('Body', sc.body, sub(a, 0.04, 0.7, 0.92, 0.26), 46, 2);
    return undefined;
  },
  'number-stat'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const ring = isL(c) ? { x: 0.5 - 0.17, y: a.y + a.h * 0.02, w: 0.34, h: a.h * 0.62 } : sub(a, 0.12, 0.04, 0.76, isV(c) ? 0.48 : 0.62);
    const sq = Math.min(ring.w * c.W, ring.h * c.H);
    const rbox: Box = { x: 0.5 - sq / c.W / 2, y: ring.y + (ring.h - sq / c.H) / 2, w: sq / c.W, h: sq / c.H };
    b.shape('Ring', 'ring', rbox, { stroke: { color: c.style.palette.primary, width: 18 }, animateProgress: true }, 0, 'fade');
    b.counter$('Stat', sc, { x: rbox.x + rbox.w * 0.1, y: rbox.y + rbox.h * 0.25, w: rbox.w * 0.8, h: rbox.h * 0.5 }, 150, 0);
    b.heading$('Label', sc.headline, sub(a, 0, isV(c) ? 0.58 : 0.68, 1, 0.2), 76, 1);
    b.body$('Body', sc.body, sub(a, 0.05, isV(c) ? 0.8 : 0.88, 0.9, 0.18), 40, 2);
    return undefined;
  },
  'split-compare'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const rtl = c.dir === 'rtl';
    const pal = c.style.palette;
    b.heading$('Headline', sc.headline, sub(a, 0, 0, 1, 0.14), 64, 0);
    const halves: [Box, Box] = isL(c)
      ? [mirror(sub(a, 0, 0.18, 0.485, 0.8), rtl), mirror(sub(a, 0.515, 0.18, 0.485, 0.8), rtl)]
      : [sub(a, 0, 0.17, 1, 0.4), sub(a, 0, 0.6, 1, 0.4)];
    const sides = [{ d: sc.left, icon: 'cross' as const, tint: withAlpha('#ef4444', 0.18) }, { d: sc.right, icon: 'check' as const, tint: withAlpha(pal.primary, 0.22) }];
    sides.forEach((sd, i) => {
      const h = halves[i];
      b.shape(i ? 'Right panel' : 'Left panel', 'rect', h, { fill: sd.tint, radius: c.style.radius ?? 20, stroke: { color: withAlpha(pal.text, 0.15), width: 2 } }, i * 2, i ? 'slide-left' : 'slide-right');
      const iconS = Math.min(h.w * c.W, h.h * c.H) * 0.22;
      const ib: Box = { x: h.x + h.w / 2 - iconS / c.W / 2, y: h.y + h.h * 0.08, w: iconS / c.W, h: iconS / c.H };
      b.shape(i ? 'Check' : 'Cross', sd.icon, ib, {}, i * 2 + 1, 'pop');
      b.heading$(i ? 'Right title' : 'Left title', sd.d?.title, sub(h, 0.06, 0.38, 0.88, 0.26), 64, i * 2 + 1);
      b.body$(i ? 'Right body' : 'Left body', sd.d?.body, sub(h, 0.06, 0.66, 0.88, 0.3), 38, i * 2 + 2);
    });
    return undefined;
  },
  'media-full'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    b.body$('Kicker', sc.kicker, sub(a, 0, 0.56, 1, 0.08), 36, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true, letterSpacing: 3 });
    b.heading$('Headline', sc.headline, sub(a, 0, 0.64, 1, 0.22), isL(c) ? 84 : 92, 1);
    b.body$('Body', sc.body, sub(a, 0.05, 0.86, 0.9, 0.14), 38, 2);
    return { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: c.style.mediaOverlay ?? 0.35, kenBurns: true };
  },
  'media-card'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    if (isL(c)) {
      const t = mirror(sub(a, 0, 0.1, 0.44, 0.8), c.dir === 'rtl');
      b.body$('Kicker', sc.kicker, sub(t, 0, 0, 1, 0.14), 34, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true, align: 'start' });
      b.heading$('Headline', sc.headline, sub(t, 0, 0.16, 1, 0.46), 84, 1, { align: 'start' });
      b.body$('Body', sc.body, sub(t, 0, 0.64, 1, 0.36), 38, 2, { align: 'start' });
      return { box: mirror(sub(a, 0.5, 0.02, 0.5, 0.96), c.dir === 'rtl'), fit: 'cover', radius: c.style.radius ?? 24, kenBurns: true };
    }
    b.body$('Kicker', sc.kicker, sub(a, 0, 0, 1, 0.07), 34, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true });
    b.heading$('Headline', sc.headline, sub(a, 0, 0.6, 1, 0.22), 84, 1);
    b.body$('Body', sc.body, sub(a, 0.04, 0.83, 0.92, 0.17), 38, 2);
    return { box: sub(a, 0.02, 0.08, 0.96, 0.5), fit: 'cover', radius: c.style.radius ?? 24, kenBurns: true };
  },
  quote(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    b.heading$('Quote mark', '“', sub(a, 0.3, 0, 0.4, 0.24), 260, 0, { color: withAlpha(c.style.palette.accent, 0.85), fontFamily: 'Playfair Display', uppercase: false, shadow: undefined }, 'pop');
    b.heading$('Quote', sc.headline, sub(a, 0, 0.2, 1, 0.52), isL(c) ? 80 : 88, 1, { uppercase: false, fontFamily: c.style.headingFont });
    b.shape('Divider', 'line', sub(a, 0.4, 0.77, 0.2, 0.004), { stroke: { color: c.style.palette.accent, width: 4 }, animateProgress: true }, 2);
    b.body$('Author', sc.author ?? sc.body, sub(a, 0, 0.8, 1, 0.12), 40, 3, { color: c.style.palette.text, fontWeight: 700 });
    return sc.mediaKind !== 'none' ? { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.6, kenBurns: true } : undefined;
  },
  'lower-third'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const bar: Box = isL(c) ? mirror({ x: 0.06, y: a.y + a.h * 0.72, w: 0.5, h: a.h * 0.2 }, c.dir === 'rtl') : { x: 0.06, y: a.y + a.h * 0.72, w: 0.88, h: a.h * 0.2 };
    b.shape('Bar', 'rect', bar, { fill: withAlpha(c.style.palette.surface, 0.9), radius: 10 }, 0, 'wipe');
    const accent: Box = c.dir === 'rtl' ? { x: bar.x + bar.w - 0.012, y: bar.y, w: 0.012, h: bar.h } : { x: bar.x, y: bar.y, w: 0.012, h: bar.h };
    b.shape('Accent', 'rect', accent, { fill: c.style.palette.primary }, 0, 'fade');
    b.heading$('Name', sc.headline, sub(bar, 0.06, 0.08, 0.88, 0.52), 64, 1, { align: 'start', uppercase: false });
    b.body$('Title', sc.body ?? sc.label, sub(bar, 0.06, 0.6, 0.88, 0.34), 34, 2, { align: 'start', color: c.style.palette.muted });
    b.body$('Kicker', sc.kicker, sub(a, 0, 0, 1, 0.08), 34, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true });
    return { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: (c.style.mediaOverlay ?? 0.3) * 0.6, kenBurns: true };
  },
  'product-hero'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    if (sc.mediaKind === 'none') {
      b.heading$('Product', sc.headline, sub(a, 0, 0.18, 1, 0.34), isL(c) ? 120 : 112, 0, {}, 'pop');
      b.body$('Benefit', sc.body, sub(a, 0.06, 0.54, 0.88, 0.14), 44, 1);
      if (sc.label) { const pill = isL(c) ? sub(a, 0.36, 0.72, 0.28, 0.13) : sub(a, 0.25, 0.72, 0.5, 0.09); b.shape('Pill', 'pill', pill, { fill: pal.accent }, 2, 'pop'); b.heading$('Pill text', sc.label, pill, 42, 2, { color: pal.bg, shadow: undefined }, 'pop'); }
      return undefined;
    }
    const glow = isL(c) ? mirror(sub(a, 0.52, 0.02, 0.46, 0.96), c.dir === 'rtl') : sub(a, 0.08, 0.06, 0.84, 0.52);
    b.shape('Glow', 'circle', glow, { fill: withAlpha(pal.primary, 0.28) }, 0, 'zoom-in');
    if (isL(c)) {
      const t = mirror(sub(a, 0, 0.12, 0.48, 0.76), c.dir === 'rtl');
      b.heading$('Product', sc.headline, sub(t, 0, 0.1, 1, 0.4), 92, 1, { align: 'start' });
      b.body$('Benefit', sc.body, sub(t, 0, 0.52, 1, 0.24), 40, 2, { align: 'start' });
      if (sc.label) { const pill = sub(t, 0, 0.8, 0.6, 0.16); b.shape('Pill', 'pill', c.dir === 'rtl' ? { ...pill, x: t.x + t.w - pill.w } : pill, { fill: pal.accent }, 3, 'pop'); b.heading$('Pill text', sc.label, c.dir === 'rtl' ? { ...pill, x: t.x + t.w - pill.w } : pill, 40, 3, { color: pal.bg, shadow: undefined }, 'pop'); }
      return { box: sub(glow, 0.1, 0.1, 0.8, 0.8), fit: 'contain', kenBurns: true };
    }
    b.heading$('Product', sc.headline, sub(a, 0, 0.62, 1, 0.16), 88, 1);
    b.body$('Benefit', sc.body, sub(a, 0.05, 0.78, 0.9, 0.1), 40, 2);
    if (sc.label) { const pill = sub(a, 0.25, 0.89, 0.5, 0.09); b.shape('Pill', 'pill', pill, { fill: pal.accent }, 3, 'pop'); b.heading$('Pill text', sc.label, pill, 40, 3, { color: pal.bg, shadow: undefined }, 'pop'); }
    return { box: sub(glow, 0.1, 0.06, 0.8, 0.88), fit: 'contain', kenBurns: true };
  },
  cta(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    b.heading$('Headline', sc.headline, sub(a, 0, 0.14, 1, 0.38), isL(c) ? 100 : 108, 0);
    b.body$('Body', sc.body, sub(a, 0.06, 0.52, 0.88, 0.14), 42, 1);
    const btn = isL(c) ? sub(a, 0.32, 0.7, 0.36, 0.14) : sub(a, 0.16, 0.7, 0.68, 0.11);
    b.shape('Button', 'pill', btn, { fill: pal.primary }, 2, 'pop');
    b.heading$('Button text', sc.label ?? 'Follow', btn, 46, 2, { color: pal.bg, shadow: undefined, fontFamily: c.style.bodyFont, fontWeight: 800 }, 'pop');
    b.body$('Handle', sc.kicker, sub(a, 0, 0.88, 1, 0.08), 34, 3, { color: pal.muted });
    return undefined;
  },
  chapter(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    b.body$('Chapter', sc.kicker, sub(a, 0, 0.26, 1, 0.08), 40, 0, { color: c.style.palette.accent, fontWeight: 800, uppercase: true, letterSpacing: 8 });
    b.shape('Rule', 'line', sub(a, 0.38, 0.36, 0.24, 0.004), { stroke: { color: c.style.palette.accent, width: 3 }, animateProgress: true }, 1);
    b.heading$('Title', sc.headline, sub(a, 0, 0.4, 1, 0.32), isL(c) ? 110 : 104, 1, {}, 'blur');
    b.body$('Body', sc.body, sub(a, 0.08, 0.74, 0.84, 0.16), 40, 2);
    return sc.mediaKind !== 'none' ? { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.65, kenBurns: true } : undefined;
  },
  'talking-head'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    const chip = isL(c) ? { x: 0.06, y: 0.06, w: 0.34, h: 0.09 } : { x: 0.14, y: 0.06, w: 0.72, h: 0.055 };
    b.shape('Topic chip', 'pill', mirror(chip, c.dir === 'rtl' && isL(c)), { fill: withAlpha(pal.surface, 0.85) }, 0, 'pop');
    b.heading$('Topic', sc.headline, mirror(chip, c.dir === 'rtl' && isL(c)), 40, 0, { uppercase: false, shadow: undefined, fontFamily: c.style.bodyFont, fontWeight: 800 }, 'pop');
    if (sc.label) {
      const tag = isL(c) ? { x: 0.06, y: a.y + a.h * 0.86, w: 0.26, h: 0.08 } : { x: 0.08, y: a.y + a.h * 0.9, w: 0.48, h: 0.045 };
      b.shape('Name tag', 'rect', mirror(tag, c.dir === 'rtl'), { fill: pal.primary, radius: 10 }, 1, 'slide-right');
      b.heading$('Name', sc.label, mirror(tag, c.dir === 'rtl'), 34, 1, { color: pal.bg, shadow: undefined, uppercase: false }, 'fade');
    }
    return { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.08 };
  },
  checklist(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const items = (sc.bullets ?? []).slice(0, 5);
    b.heading$('Headline', sc.headline, sub(a, 0, 0, 1, 0.2), 80, 0);
    const top = 0.24; const rowH = Math.min(0.15, 0.74 / Math.max(1, items.length));
    items.forEach((it, i) => {
      const row = sub(a, 0.02, top + i * rowH, 0.96, rowH * 0.88);
      const iconW = Math.min(row.h * c.H, row.w * c.W * 0.14) / c.W;
      const icon: Box = c.dir === 'rtl' ? { x: row.x + row.w - iconW, y: row.y + (row.h - iconW * c.W / c.H) / 2, w: iconW, h: iconW * c.W / c.H } : { x: row.x, y: row.y + (row.h - iconW * c.W / c.H) / 2, w: iconW, h: iconW * c.W / c.H };
      const textBox: Box = c.dir === 'rtl' ? { x: row.x, y: row.y, w: row.w - iconW - 0.03, h: row.h } : { x: row.x + iconW + 0.03, y: row.y, w: row.w - iconW - 0.03, h: row.h };
      b.shape(`Check ${i + 1}`, 'check', icon, { fill: c.style.palette.primary }, i * 3 + 2, 'pop');
      b.body$(`Item ${i + 1}`, it, textBox, 48, i * 3 + 2, { align: 'start', color: c.style.palette.text, fontWeight: 700 }, 'slide-up');
    });
    return undefined;
  },
  'timeline-step'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    const frac = Math.max(0.05, Math.min(1, c.sceneIndex / Math.max(1, c.sceneCount - 1)));
    b.body$('Step', sc.kicker, sub(a, 0, 0, 1, 0.08), 38, 0, { color: pal.accent, fontWeight: 800, uppercase: true, letterSpacing: 4 });
    const track = sub(a, 0.1, 0.1, 0.8, 0.018);
    b.shape('Track', 'pill', track, { fill: withAlpha(pal.text, 0.18) }, 0);
    b.shape('Progress', 'pill', { ...track, w: track.w * frac, x: c.dir === 'rtl' ? track.x + track.w * (1 - frac) : track.x }, { fill: pal.primary }, 1, 'wipe');
    const hasMedia = sc.mediaKind !== 'none';
    b.heading$('Title', sc.headline, sub(a, 0, hasMedia ? 0.6 : 0.24, 1, hasMedia ? 0.2 : 0.38), 88, 1);
    b.body$('Body', sc.body, sub(a, 0.04, hasMedia ? 0.81 : 0.66, 0.92, hasMedia ? 0.19 : 0.28), 42, 2);
    return hasMedia ? { box: sub(a, 0.03, 0.16, 0.94, 0.42), fit: 'cover', radius: c.style.radius, kenBurns: true } : undefined;
  },
  news(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    const tag = isL(c) ? mirror({ x: 0.07, y: a.y + a.h * 0.52, w: 0.18, h: 0.07 }, c.dir === 'rtl') : { x: 0.08, y: a.y + a.h * 0.5, w: 0.4, h: 0.045 };
    const tagBox = mirror(tag, c.dir === 'rtl' && !isL(c));
    b.shape('Tag', 'rect', tagBox, { fill: pal.primary, radius: 6 }, 0, 'wipe');
    b.heading$('Tag text', sc.label ?? sc.kicker ?? 'BREAKING', tagBox, 36, 0, { color: '#ffffff', shadow: undefined }, 'fade');
    const hb = isL(c) ? mirror({ x: 0.07, y: a.y + a.h * 0.6, w: 0.62, h: a.h * 0.26 }, c.dir === 'rtl') : sub(a, 0, 0.58, 1, 0.26);
    b.shape('Headline bar', 'rect', hb, { fill: withAlpha('#000000', 0.72), radius: 8 }, 1, 'wipe');
    b.heading$('Headline', sc.headline, sub(hb, 0.04, 0.08, 0.92, 0.84), 72, 1, { align: 'start' });
    b.body$('Ticker', sc.body, sub(a, 0, 0.88, 1, 0.1), 34, 2, { color: pal.muted, align: 'start' });
    return { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.25, kenBurns: true };
  },
  testimonial(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    b.shape('Card', 'rect', sub(a, 0, 0.08, 1, 0.84), { fill: withAlpha(pal.surface, 0.92), radius: c.style.radius ?? 28, stroke: { color: withAlpha(pal.text, 0.12), width: 2 } }, 0, 'zoom-in');
    b.heading$('Stars', '★★★★★', sub(a, 0.2, 0.14, 0.6, 0.1), 70, 1, { color: pal.accent, uppercase: false, shadow: undefined, fontFamily: 'Inter' }, 'pop');
    b.heading$('Review', sc.headline, sub(a, 0.07, 0.26, 0.86, 0.42), 70, 2, { uppercase: false });
    b.body$('Name', sc.author ?? sc.label, sub(a, 0.07, 0.7, 0.86, 0.08), 42, 3, { color: pal.text, fontWeight: 800 });
    b.body$('Role', sc.body, sub(a, 0.07, 0.78, 0.86, 0.08), 34, 4);
    return undefined;
  },
  'price-offer'(sc, c, b) {
    const a = contentArea(c.orientation, c.captions);
    const pal = c.style.palette;
    b.body$('Kicker', sc.kicker, sub(a, 0, 0.04, 1, 0.08), 42, 0, { color: pal.accent, fontWeight: 800, uppercase: true, letterSpacing: 6 });
    b.counter$('Offer', sc, sub(a, 0, 0.14, 1, 0.34), 220, 1);
    b.heading$('Product', sc.headline, sub(a, 0, 0.5, 1, 0.18), 80, 2);
    const pill = isL(c) ? sub(a, 0.3, 0.72, 0.4, 0.13) : sub(a, 0.15, 0.72, 0.7, 0.1);
    if (sc.label) { b.shape('Code pill', 'pill', pill, { fill: pal.primary }, 3, 'pop'); b.heading$('Code', sc.label, pill, 44, 3, { color: pal.bg, shadow: undefined }, 'pop'); }
    b.body$('Body', sc.body, sub(a, 0.05, 0.86, 0.9, 0.12), 38, 4);
    return sc.mediaKind !== 'none' ? { box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', overlay: 0.6, kenBurns: true } : undefined;
  },
};

export const LAYOUT_IDS = Object.keys(L) as LayoutId[];

export function runLayout(layout: LayoutId, scene: PlanScene, c: LayoutContext): LayoutOutput {
  const b = new Builder(c, scene.id);
  const fn = L[layout] ?? L.title;
  const media = fn(scene, c, b) ?? undefined;
  return { media, overlay: b.overlay, text: b.text };
}
