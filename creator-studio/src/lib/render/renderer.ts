/**
 * Isomorphic frame renderer. `renderFrame` draws a composition at a point in
 * time onto any Canvas-2D context: an HTMLCanvasElement in the editor and
 * template previews, or a Skia (@napi-rs/canvas) context in the export worker.
 */
import type {
  Composition, Clip, VisualClip, Track, Transition, Animation, Box, TextClip, ImageClip, VideoClip,
  ShapeClip, CaptionClip, TextStyle, MediaPlaceholder,
} from '../composition/types';
import { clamp, ease, lerp, withAlpha, readableOn } from './util';
import { drawBackground } from './backgrounds';
import { layoutText, visualOrder, lineStartX, blockStartY, detectDirection, stripMarkup, type Dir, type TextLayout } from './text';
import { cssFont } from './fonts';

type Ctx = CanvasRenderingContext2D;
export type Drawable = CanvasImageSource;

export interface MediaSource {
  image(clip: ImageClip): Drawable | null;
  videoFrame(clip: VideoClip, sourceMs: number): Drawable | null;
}

export interface RenderOptions {
  media?: MediaSource;
  /** Editor mode: show placeholders for empty media slots. */
  placeholders?: boolean;
  selectedClipId?: string | null;
  safeArea?: boolean;
}

interface AnimState {
  alpha: number; dx: number; dy: number; scale: number; rotation: number;
  wipe: number; blur: number; reveal: number; revealMode: 'none' | 'chars' | 'words' | 'rise';
}

const baseState = (): AnimState => ({ alpha: 1, dx: 0, dy: 0, scale: 1, rotation: 0, wipe: 1, blur: 0, reveal: 1, revealMode: 'none' });

export function sizeOf(src: Drawable): { w: number; h: number } {
  const s = src as unknown as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { w: s.videoWidth || s.naturalWidth || s.width || 1, h: s.videoHeight || s.naturalHeight || s.height || 1 };
}

function boxPx(b: Box, W: number, H: number) {
  return { x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H };
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// ───────────────────────── Animations ─────────────────────────

function applyAnim(st: AnimState, a: Animation, p: number, W: number, H: number, isExit: boolean) {
  const e = ease(a.easing ?? (isExit ? 'easeIn' : 'easeOut'), p);
  switch (a.type) {
    case 'none': break;
    case 'fade': st.alpha *= e; break;
    case 'slide-up': st.dy += (1 - e) * H * 0.07 * (isExit ? -1 : 1); st.alpha *= e; break;
    case 'slide-down': st.dy -= (1 - e) * H * 0.07 * (isExit ? -1 : 1); st.alpha *= e; break;
    case 'slide-left': st.dx += (1 - e) * W * 0.1 * (isExit ? -1 : 1); st.alpha *= e; break;
    case 'slide-right': st.dx -= (1 - e) * W * 0.1 * (isExit ? -1 : 1); st.alpha *= e; break;
    case 'pop': st.scale *= 0.55 + 0.45 * ease('backOut', p); st.alpha *= clamp(p * 3); break;
    case 'zoom-in': st.scale *= 0.82 + 0.18 * e; st.alpha *= e; break;
    case 'zoom-out': st.scale *= 1.25 - 0.25 * e; st.alpha *= e; break;
    case 'wipe': st.wipe = Math.min(st.wipe, e); break;
    case 'blur': st.blur = Math.max(st.blur, (1 - e) * 24); st.alpha *= e; break;
    case 'typewriter':
      if (isExit) st.alpha *= e; else { st.reveal = clamp(p); st.revealMode = 'chars'; }
      break;
    case 'words':
    case 'rise-words':
      if (isExit) st.alpha *= e; else { st.reveal = clamp(p); st.revealMode = a.type === 'words' ? 'words' : 'rise'; }
      break;
  }
}

function animState(clip: Clip, localT: number, W: number, H: number, holdExit: boolean): AnimState {
  const st = baseState();
  if (clip.enter && clip.enter.type !== 'none' && clip.enter.durationMs > 0) {
    const p = (localT - (clip.enter.delayMs ?? 0)) / clip.enter.durationMs;
    if (p < 1) applyAnim(st, clip.enter, clamp(p), W, H, false);
  }
  if (!holdExit && clip.exit && clip.exit.type !== 'none' && clip.exit.durationMs > 0) {
    const startExit = clip.duration - clip.exit.durationMs;
    if (localT > startExit) applyAnim(st, clip.exit, clamp(1 - (localT - startExit) / clip.exit.durationMs), W, H, true);
  }
  return st;
}

// ───────────────────────── Track ops & transitions ─────────────────────────

interface DrawOp { clip: VisualClip; role: 'none' | 'in' | 'out'; p: number; transition?: Transition }

export function activeOps(track: Track, t: number): DrawOp[] {
  const ops: DrawOp[] = [];
  const handled = new Set<string>();
  const clips = track.clips as VisualClip[];
  for (const c of clips) {
    if (t < c.start || t >= c.start + c.duration) continue;
    const tr = c.transition;
    if (tr && tr.type !== 'cut' && tr.durationMs > 0 && t < c.start + tr.durationMs) {
      const prev = clips
        .filter((x) => x.id !== c.id && x.start < c.start && x.start + x.duration >= c.start - 60)
        .sort((a, b) => b.start - a.start)[0];
      const p = ease('easeInOut', (t - c.start) / tr.durationMs);
      if (prev && !handled.has(prev.id)) {
        handled.add(prev.id);
        ops.push({ clip: prev, role: 'out', p, transition: tr });
      }
      ops.push({ clip: c, role: 'in', p, transition: tr });
      handled.add(c.id);
    }
  }
  for (const c of clips) {
    if (handled.has(c.id)) continue;
    if (t >= c.start && t < c.start + c.duration) ops.push({ clip: c, role: 'none', p: 1 });
  }
  return ops.sort((a, b) => (a.role === 'out' ? -1 : b.role === 'out' ? 1 : a.clip.start - b.clip.start));
}

// ───────────────────────── Public entry ─────────────────────────

export function renderFrame(ctx: Ctx, comp: Composition, tMs: number, W: number, H: number, opts: RenderOptions = {}) {
  ctx.save();
  ctx.fillStyle = comp.background;
  ctx.fillRect(0, 0, W, H);
  const scale = Math.min(W, H) / 1080;
  for (const track of comp.tracks) {
    if (track.kind !== 'visual' || track.hidden) continue;
    for (const op of activeOps(track, tMs)) drawOp(ctx, op, tMs, W, H, scale, opts);
  }
  if (opts.safeArea) drawSafeArea(ctx, W, H);
  ctx.restore();
}

function drawOp(ctx: Ctx, op: DrawOp, t: number, W: number, H: number, scale: number, opts: RenderOptions) {
  const { clip, role, p, transition } = op;
  const tr = transition?.type;
  if (role !== 'none' && (tr === 'fade-black' || tr === 'fade-white')) {
    if ((role === 'out' && p >= 0.5) || (role === 'in' && p < 0.5)) {
      if (role === 'in') { ctx.save(); ctx.fillStyle = tr === 'fade-black' ? '#000' : '#fff'; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      return;
    }
  }
  ctx.save();
  let alphaMul = 1;
  if (role === 'in' && tr) {
    switch (tr) {
      case 'crossfade': alphaMul = p; break;
      case 'wipe-left': ctx.beginPath(); ctx.rect(W * (1 - p), 0, W * p + 1, H); ctx.clip(); break;
      case 'wipe-right': ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); break;
      case 'wipe-up': ctx.beginPath(); ctx.rect(0, H * (1 - p), W, H * p + 1); ctx.clip(); break;
      case 'slide-left': ctx.translate((1 - p) * W, 0); break;
      case 'slide-right': ctx.translate(-(1 - p) * W, 0); break;
      case 'slide-up': ctx.translate(0, (1 - p) * H); break;
      case 'zoom-in': ctx.translate(W / 2, H / 2); ctx.scale(1.3 - 0.3 * p, 1.3 - 0.3 * p); ctx.translate(-W / 2, -H / 2); alphaMul = p; break;
      case 'circle': ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2); ctx.clip(); break;
      case 'flash': alphaMul = p >= 0.5 ? 1 : 0; break;
    }
  } else if (role === 'out' && tr) {
    switch (tr) {
      case 'slide-left': ctx.translate(-p * W, 0); break;
      case 'slide-right': ctx.translate(p * W, 0); break;
      case 'slide-up': ctx.translate(0, -p * H); break;
      case 'flash': alphaMul = p < 0.5 ? 1 : 0; break;
    }
  }
  const localT = t - clip.start;
  const st = animState(clip, localT, W, H, role === 'out');
  ctx.globalAlpha *= clamp(alphaMul * st.alpha * (clip.opacity ?? 1));
  if (ctx.globalAlpha > 0.001) drawClip(ctx, clip, localT, t, st, W, H, scale, opts);
  ctx.restore();

  if (role !== 'none' && (tr === 'fade-black' || tr === 'fade-white')) {
    const a = role === 'out' ? p * 2 : (1 - p) * 2;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = tr === 'fade-black' ? '#000' : '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (role === 'in' && tr === 'flash') {
    ctx.save(); ctx.globalAlpha = clamp(1 - Math.abs(2 * p - 1)) * 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (opts.selectedClipId === clip.id && 'box' in clip) {
    const b = boxPx(clip.box, W, H);
    ctx.save(); ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = Math.max(2, 3 * scale); ctx.setLineDash([10 * scale, 6 * scale]);
    ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore();
  }
}

function applyLocalTransform(ctx: Ctx, clip: Clip, st: AnimState, box: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  const tf = clip.transform ?? {};
  const cx = box.x + box.w / 2; const cy = box.y + box.h / 2;
  ctx.translate(cx + st.dx + (tf.x ?? 0) * W, cy + st.dy + (tf.y ?? 0) * H);
  const rot = (tf.rotation ?? 0) + st.rotation;
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  const s = (tf.scale ?? 1) * st.scale;
  if (s !== 1) ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  if (st.wipe < 1) { ctx.beginPath(); ctx.rect(box.x, box.y, box.w * st.wipe, box.h); ctx.clip(); }
  if (st.blur > 0.3 && 'filter' in ctx) ctx.filter = `blur(${(st.blur * Math.min(W, H)) / 1080}px)`;
}

function drawClip(ctx: Ctx, clip: VisualClip, localT: number, t: number, st: AnimState, W: number, H: number, scale: number, opts: RenderOptions) {
  switch (clip.type) {
    case 'background':
      applyLocalTransform(ctx, clip, st, { x: 0, y: 0, w: W, h: H }, W, H);
      drawBackground(ctx, W, H, t, clip.style);
      return;
    case 'image':
    case 'video': {
      const b = boxPx(clip.box, W, H);
      applyLocalTransform(ctx, clip, st, b, W, H);
      const src = clip.type === 'image'
        ? opts.media?.image(clip) ?? null
        : opts.media?.videoFrame(clip, clip.trimIn + Math.max(0, localT) * clip.speed) ?? null;
      if (!src) { drawPlaceholder(ctx, clip.placeholder, b, t, scale, opts.placeholders ?? false, clip.type); }
      else {
        let kb = { scale: 1, x: 0, y: 0 };
        if (clip.type === 'image' && clip.kenBurns) {
          const f = ease('easeInOut', clamp(localT / clip.duration));
          kb = { scale: lerp(clip.kenBurns.from.scale, clip.kenBurns.to.scale, f), x: lerp(clip.kenBurns.from.x, clip.kenBurns.to.x, f), y: lerp(clip.kenBurns.from.y, clip.kenBurns.to.y, f) };
        }
        ctx.save();
        roundRectPath(ctx, b.x, b.y, b.w, b.h, (clip.radius ?? 0) * scale);
        ctx.clip();
        drawMedia(ctx, src, b, clip.fit, kb);
        ctx.restore();
      }
      if (clip.overlay && clip.overlay.opacity > 0) {
        ctx.save(); ctx.globalAlpha *= clip.overlay.opacity; ctx.fillStyle = clip.overlay.color;
        roundRectPath(ctx, b.x, b.y, b.w, b.h, (clip.radius ?? 0) * scale); ctx.fill(); ctx.restore();
      }
      return;
    }
    case 'text': {
      const b = boxPx(clip.box, W, H);
      applyLocalTransform(ctx, clip, st, b, W, H);
      drawTextClip(ctx, clip, localT, st, b, scale);
      return;
    }
    case 'shape': {
      const b = boxPx(clip.box, W, H);
      applyLocalTransform(ctx, clip, st, b, W, H);
      drawShape(ctx, clip, localT, b, scale);
      return;
    }
    case 'caption': {
      const b = boxPx(clip.box, W, H);
      applyLocalTransform(ctx, clip, st, b, W, H);
      drawCaption(ctx, clip, localT, b, scale);
      return;
    }
  }
}

function drawMedia(ctx: Ctx, src: Drawable, b: { x: number; y: number; w: number; h: number }, fit: 'cover' | 'contain', kb: { scale: number; x: number; y: number }) {
  const { w: sw, h: sh } = sizeOf(src);
  const s = fit === 'cover' ? Math.max(b.w / sw, b.h / sh) : Math.min(b.w / sw, b.h / sh);
  const dw = sw * s * kb.scale; const dh = sh * s * kb.scale;
  const dx = b.x + (b.w - dw) / 2 + kb.x * b.w; const dy = b.y + (b.h - dh) / 2 + kb.y * b.h;
  ctx.drawImage(src, dx, dy, dw, dh);
}

function drawPlaceholder(ctx: Ctx, ph: MediaPlaceholder | undefined, b: { x: number; y: number; w: number; h: number }, t: number, scale: number, editor: boolean, kind: string) {
  if (!editor) {
    if (ph?.fallback) {
      ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
      ctx.translate(b.x, b.y); drawBackground(ctx, b.w, b.h, t, ph.fallback); ctx.restore();
    }
    return;
  }
  ctx.save();
  if (ph?.fallback) { ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); ctx.translate(b.x, b.y); drawBackground(ctx, b.w, b.h, t, ph.fallback); ctx.translate(-b.x, -b.y); }
  else { ctx.fillStyle = 'rgba(124,92,255,0.12)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([12 * scale, 8 * scale]); ctx.lineWidth = 2 * scale;
  ctx.strokeRect(b.x + 4 * scale, b.y + 4 * scale, b.w - 8 * scale, b.h - 8 * scale);
  ctx.setLineDash([]);
  const label = `${kind === 'video' ? '▶' : '▣'} ${ph?.label ?? kind}`;
  ctx.font = cssFont(700, 30 * scale, 'Inter'); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textBaseline = 'top';
  ctx.direction = detectDirection(label); ctx.textAlign = 'left';
  ctx.fillText(label.slice(0, 60), b.x + 22 * scale, b.y + 20 * scale, b.w - 44 * scale);
  ctx.restore();
}

// ───────────────────────── Text ─────────────────────────

function resolveDir(text: string, d?: 'auto' | 'ltr' | 'rtl'): Dir {
  return d === 'ltr' || d === 'rtl' ? d : detectDirection(stripMarkup(text));
}

function setTextEffects(ctx: Ctx, style: TextStyle, scale: number) {
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color; ctx.shadowBlur = style.shadow.blur * scale;
    ctx.shadowOffsetX = (style.shadow.x ?? 0) * scale; ctx.shadowOffsetY = (style.shadow.y ?? 0) * scale;
  }
}

function paintWord(ctx: Ctx, text: string, x: number, y: number, color: string, style: TextStyle, scale: number, dir: Dir) {
  ctx.direction = dir;
  ctx.textAlign = 'left';
  if (style.stroke && style.stroke.width > 0) {
    ctx.save(); ctx.shadowColor = 'transparent';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.strokeStyle = style.stroke.color; ctx.lineWidth = style.stroke.width * scale;
    ctx.strokeText(text, x, y); ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function formatCounter(v: number, decimals = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function drawTextClip(ctx: Ctx, clip: TextClip, localT: number, st: AnimState, b: { x: number; y: number; w: number; h: number }, scale: number) {
  let text = clip.text;
  if (clip.counter) {
    const p = ease('expoOut', clamp(localT / Math.min(clip.duration * 0.7, 1800)));
    text = text.replace('{n}', formatCounter(lerp(clip.counter.from, clip.counter.to, p), clip.counter.decimals));
  }
  const style = clip.style;
  const dir = resolveDir(text, clip.direction);
  const layout = layoutText(ctx, text, style, b.w, b.h, scale, dir);
  drawLayout(ctx, layout, style, b, scale, st, null, -1);
}

function drawLayout(
  ctx: Ctx, layout: TextLayout, style: TextStyle, b: { x: number; y: number; w: number; h: number }, scale: number,
  st: AnimState, wordColor: ((index: number) => { color: string; scale: number; bg?: string; glow?: boolean }) | null, _active: number,
) {
  const lh = layout.lineHeightPx;
  const y0 = blockStartY(layout.height, b.y, b.h, style.valign);
  ctx.font = layout.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(style.letterSpacing ?? 0) * scale * (layout.fontSize / (style.fontSize * scale))}px`;
  ctx.textBaseline = 'middle';
  const bg = style.background;
  const pad = (bg?.padding ?? 0) * scale;
  if (bg && (bg.mode ?? 'box') === 'box' && layout.lines.some((l) => l.words.length)) {
    const xs = layout.lines.map((l) => lineStartX(l.width, b.x, b.w, style.align, layout.dir));
    const minX = Math.min(...xs); const maxX = Math.max(...layout.lines.map((l, i) => xs[i] + l.width));
    ctx.save(); ctx.fillStyle = bg.color;
    if (st.revealMode !== 'none') ctx.globalAlpha *= clamp(st.reveal * 4);
    roundRectPath(ctx, minX - pad, y0 - pad * 0.6, maxX - minX + pad * 2, layout.height + pad * 1.2, bg.radius * scale); ctx.fill(); ctx.restore();
  }
  const totalChars = layout.lines.reduce((n, l) => n + l.words.reduce((m, w) => m + Array.from(w.text).length + 1, 0), 0);
  let charsLeft = st.revealMode === 'chars' ? Math.floor(st.reveal * totalChars) : Infinity;
  const N = Math.max(1, layout.wordCount);
  ctx.save();
  setTextEffects(ctx, style, scale);
  layout.lines.forEach((line, li) => {
    if (!line.words.length) return;
    const x0 = lineStartX(line.width, b.x, b.w, style.align, layout.dir);
    const y = y0 + li * lh + lh / 2;
    if (bg && bg.mode === 'line') {
      ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = bg.color;
      roundRectPath(ctx, x0 - pad, y - lh / 2 - pad * 0.25, line.width + pad * 2, lh + pad * 0.5, bg.radius * scale); ctx.fill(); ctx.restore();
    }
    const simple = !wordColor && st.revealMode !== 'words' && st.revealMode !== 'rise' && !line.words.some((w) => w.emph);
    if (simple) {
      const full = line.words.map((w) => w.text).join(' ');
      let shown = full;
      if (charsLeft !== Infinity) {
        const chars = Array.from(full);
        shown = chars.slice(0, Math.max(0, charsLeft)).join('');
        charsLeft -= chars.length + 1;
        if (!shown) return;
      }
      ctx.direction = layout.dir;
      const ltr = layout.dir === 'ltr';
      ctx.textAlign = ltr ? 'left' : 'right';
      const x = ltr ? x0 : x0 + line.width;
      if (style.stroke && style.stroke.width > 0) {
        ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineJoin = 'round'; ctx.strokeStyle = style.stroke.color; ctx.lineWidth = style.stroke.width * scale;
        ctx.strokeText(shown, x, y); ctx.restore();
      }
      ctx.fillStyle = style.color;
      ctx.fillText(shown, x, y);
      return;
    }
    let x = x0;
    for (const w of visualOrder(line.words, layout.dir)) {
      const look = wordColor ? wordColor(w.index) : { color: w.emph ? (style.highlightColor ?? style.color) : style.color, scale: 1 };
      let alpha = 1; let dy = 0; let s = look.scale;
      if (st.revealMode === 'words' || st.revealMode === 'rise') {
        const wp = clamp((st.reveal * (N + 1.5) - w.index) / 1.5);
        alpha = wp;
        if (st.revealMode === 'words') s *= 0.6 + 0.4 * ease('backOut', wp); else dy = (1 - ease('easeOut', wp)) * lh * 0.55;
      }
      if (alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        const cx = x + w.width / 2;
        if (s !== 1 || dy) { ctx.translate(cx, y + dy); ctx.scale(s, s); ctx.translate(-cx, -y); }
        if (look.bg) {
          ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillStyle = look.bg;
          roundRectPath(ctx, x - lh * 0.12, y - lh * 0.48, w.width + lh * 0.24, lh * 0.96, lh * 0.18); ctx.fill(); ctx.restore();
        }
        if (look.glow) { ctx.shadowColor = look.color; ctx.shadowBlur = 24 * scale; }
        paintWord(ctx, w.text, x, y, look.color, style, scale, w.resolved);
        ctx.restore();
      }
      x += w.width + layout.spaceWidth;
    }
  });
  ctx.restore();
}

// ───────────────────────── Captions ─────────────────────────

export function captionChunks(words: CaptionClip['words'], perLine: number): Array<{ start: number; end: number; idx: number[] }> {
  const chunks: Array<{ start: number; end: number; idx: number[] }> = [];
  for (let i = 0; i < words.length; i += perLine) {
    const idx = Array.from({ length: Math.min(perLine, words.length - i) }, (_, k) => i + k);
    chunks.push({ start: words[idx[0]].start, end: words[idx[idx.length - 1]].end, idx });
  }
  for (let i = 0; i < chunks.length - 1; i++) chunks[i].end = Math.max(chunks[i].end, Math.min(chunks[i + 1].start, chunks[i].end + 400));
  return chunks;
}

function drawCaption(ctx: Ctx, clip: CaptionClip, localT: number, b: { x: number; y: number; w: number; h: number }, scale: number) {
  if (!clip.words.length) return;
  const chunks = captionChunks(clip.words, clip.wordsPerLine ?? 3);
  const chunk = chunks.find((c) => localT >= c.start && localT < c.end);
  if (!chunk) return;
  const words = chunk.idx.map((i) => clip.words[i]);
  const text = words.map((w) => w.text.replace(/\*/g, '')).join(' ');
  const style = clip.style;
  const dir = resolveDir(text, clip.direction);
  const layout = layoutText(ctx, text, style, b.w, b.h, scale, dir);
  let active = -1;
  words.forEach((w, i) => { if (localT >= w.start) active = i; });
  const hl = style.highlightColor ?? '#ffd400';
  const sinceActive = active >= 0 ? localT - words[active].start : 0;
  const pop = 1 + 0.14 * (1 - clamp(sinceActive / 160));
  const look = (i: number) => {
    switch (clip.preset) {
      case 'karaoke': return { color: i <= active ? hl : style.color, scale: 1 };
      case 'minimal': return { color: style.color, scale: 1 };
      case 'boxed': return i === active ? { color: readableOn(hl), scale: 1, bg: hl } : { color: style.color, scale: 1 };
      case 'neon': return i === active ? { color: hl, scale: 1.05, glow: true } : { color: withAlpha(style.color, 0.85), scale: 1 };
      case 'bold-pop':
      default: return i === active ? { color: hl, scale: pop } : { color: style.color, scale: 1 };
    }
  };
  const fadeIn = clamp((localT - chunk.start) / 120);
  ctx.save();
  ctx.globalAlpha *= fadeIn;
  drawLayout(ctx, layout, style, b, scale, baseState(), look, active);
  ctx.restore();
}

// ───────────────────────── Shapes ─────────────────────────

function drawShape(ctx: Ctx, clip: ShapeClip, localT: number, b: { x: number; y: number; w: number; h: number }, scale: number) {
  const prog = clamp(localT / clip.duration);
  ctx.save();
  const fill = clip.fill; const stroke = clip.stroke;
  const doStroke = () => { if (stroke && stroke.width > 0) { ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width * scale; ctx.stroke(); } };
  switch (clip.shape) {
    case 'rect':
      roundRectPath(ctx, b.x, b.y, b.w, b.h, (clip.radius ?? 0) * scale);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } doStroke(); break;
    case 'pill':
      roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } doStroke(); break;
    case 'circle':
      ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } doStroke(); break;
    case 'ring': {
      const r = Math.min(b.w, b.h) / 2 - (stroke?.width ?? 8) * scale / 2;
      const sweep = clip.animateProgress ? ease('easeOut', prog) : 1;
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep);
      ctx.lineCap = 'round'; ctx.strokeStyle = stroke?.color ?? fill ?? '#fff'; ctx.lineWidth = (stroke?.width ?? 8) * scale; ctx.stroke(); break;
    }
    case 'line': {
      const w = clip.animateProgress ? b.w * ease('easeOut', prog * 2) : b.w;
      ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + w, b.y + b.h / 2);
      ctx.lineCap = 'round'; ctx.strokeStyle = stroke?.color ?? fill ?? '#fff'; ctx.lineWidth = Math.max(1, stroke?.width ? stroke.width * scale : b.h); ctx.stroke(); break;
    }
    case 'progress': {
      roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2); ctx.fillStyle = withAlpha(fill ?? '#ffffff', 0.25); ctx.fill();
      const w = b.w * (clip.animateProgress === false ? 1 : prog);
      if (w > 0.5) { roundRectPath(ctx, b.x, b.y, w, b.h, b.h / 2); ctx.fillStyle = fill ?? '#ffffff'; ctx.fill(); }
      break;
    }
    case 'arrow': {
      const cy = b.y + b.h / 2; const head = Math.min(b.h, b.w * 0.35);
      ctx.beginPath(); ctx.moveTo(b.x, cy); ctx.lineTo(b.x + b.w - head * 0.6, cy);
      ctx.moveTo(b.x + b.w - head, cy - head / 2); ctx.lineTo(b.x + b.w, cy); ctx.lineTo(b.x + b.w - head, cy + head / 2);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke?.color ?? fill ?? '#fff'; ctx.lineWidth = (stroke?.width ?? 10) * scale; ctx.stroke(); break;
    }
    case 'check':
    case 'cross': {
      const s = Math.min(b.w, b.h); const x = b.x + (b.w - s) / 2; const y = b.y + (b.h - s) / 2;
      ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); ctx.fillStyle = fill ?? (clip.shape === 'check' ? '#22c55e' : '#ef4444'); ctx.fill();
      ctx.beginPath();
      if (clip.shape === 'check') { ctx.moveTo(x + s * 0.28, y + s * 0.52); ctx.lineTo(x + s * 0.44, y + s * 0.68); ctx.lineTo(x + s * 0.74, y + s * 0.36); }
      else { ctx.moveTo(x + s * 0.32, y + s * 0.32); ctx.lineTo(x + s * 0.68, y + s * 0.68); ctx.moveTo(x + s * 0.68, y + s * 0.32); ctx.lineTo(x + s * 0.32, y + s * 0.68); }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.09; ctx.stroke(); break;
    }
  }
  ctx.restore();
}

function drawSafeArea(ctx: Ctx, W: number, H: number) {
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 1;
  ctx.strokeRect(W * 0.06, H * 0.08, W * 0.88, H * 0.8); ctx.restore();
}

/** Visual clips active at time t, top-most first (for click-to-select in the editor). */
export function hitTest(comp: Composition, t: number, nx: number, ny: number): VisualClip | null {
  for (let i = comp.tracks.length - 1; i >= 0; i--) {
    const tr = comp.tracks[i];
    if (tr.kind !== 'visual' || tr.hidden || tr.locked) continue;
    const clips = (tr.clips as VisualClip[]).filter((c) => t >= c.start && t < c.start + c.duration && 'box' in c);
    for (const c of clips.reverse()) {
      const b = (c as TextClip).box;
      const tf = c.transform ?? {};
      const x = b.x + (tf.x ?? 0); const y = b.y + (tf.y ?? 0);
      if (nx >= x && nx <= x + b.w && ny >= y && ny <= y + b.h) return c;
    }
  }
  return null;
}
