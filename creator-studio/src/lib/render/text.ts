/**
 * Text layout for the canvas renderer: emphasis markup (*word*), wrapping,
 * auto-fit, and a simplified Unicode bidi run ordering so mixed RTL/LTR
 * lines (e.g. Hebrew with an English product name) place words correctly.
 * Each word is shaped by the canvas itself (HarfBuzz in Skia / the browser),
 * so Arabic joining and Ethiopic glyphs are handled natively.
 */
import type { TextStyle } from '../composition/types';
import { cssFont } from './fonts';

export type Dir = 'ltr' | 'rtl';
type WordDir = Dir | 'neutral';

const RTL_RE = /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ԯሀ-᎟ⶀ-⷟꬀-꬯]/;

export function wordDirection(word: string): WordDir {
  for (const ch of word) {
    if (RTL_RE.test(ch)) return 'rtl';
    if (LTR_RE.test(ch)) return 'ltr';
  }
  return 'neutral';
}

export function detectDirection(text: string): Dir {
  for (const ch of text) {
    if (RTL_RE.test(ch)) return 'rtl';
    if (LTR_RE.test(ch)) return 'ltr';
  }
  return 'ltr';
}

export interface Word { text: string; emph: boolean; dir: WordDir; width: number; index: number }
export interface Line { words: Word[]; width: number }
export interface TextLayout {
  font: string;
  fontSize: number;
  lineHeightPx: number;
  spaceWidth: number;
  lines: Line[];
  dir: Dir;
  height: number;
  width: number;
  wordCount: number;
}

/** Parse `*emphasis*` markup and explicit newlines into words. */
export function tokenize(text: string, uppercase?: boolean): Array<{ text: string; emph: boolean; br?: boolean }> {
  const out: Array<{ text: string; emph: boolean; br?: boolean }> = [];
  let emph = false;
  const src = uppercase ? text.toLocaleUpperCase() : text;
  for (const para of src.split('\n').map((p, i) => ({ p, i }))) {
    if (para.i > 0) out.push({ text: '', emph: false, br: true });
    for (const raw of para.p.split(/\s+/)) {
      if (!raw) continue;
      let w = raw;
      let wordEmph = emph;
      if (w.startsWith('*')) { emph = true; wordEmph = true; w = w.slice(1); }
      if (w.endsWith('*')) { w = w.slice(0, -1); emph = false; }
      if (w) out.push({ text: w, emph: wordEmph });
    }
  }
  return out;
}

export function stripMarkup(text: string): string {
  return text.replace(/\*/g, '');
}

interface Measurer { measureText(t: string): { width: number }; font: string; letterSpacing?: string }

const layoutCache = new Map<string, TextLayout>();

/** Must be called when web fonts finish loading: cached measurements may come from fallback fonts. */
export function clearTextLayoutCache() { layoutCache.clear(); }

export function layoutText(
  ctx: Measurer,
  text: string,
  style: TextStyle,
  boxW: number,
  boxH: number,
  scale: number,
  forcedDir?: Dir,
): TextLayout {
  const key = `${text}|${style.fontFamily}|${style.fontWeight}|${style.fontSize}|${style.lineHeight}|${style.letterSpacing}|${style.uppercase}|${style.maxLines}|${style.autoFit}|${Math.round(boxW)}|${Math.round(boxH)}|${scale.toFixed(4)}|${forcedDir}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const tokens = tokenize(text, style.uppercase);
  const dir = forcedDir ?? detectDirection(text);
  const lineHeightMul = style.lineHeight ?? 1.15;
  let size = style.fontSize * scale;
  const minSize = size * 0.35;
  let result: TextLayout | null = null;

  for (let iter = 0; iter < 24; iter++) {
    ctx.font = cssFont(style.fontWeight, size, style.fontFamily);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(style.letterSpacing ?? 0) * scale * (size / (style.fontSize * scale))}px`;
    const spaceWidth = ctx.measureText(' ').width;
    const lines: Line[] = [];
    let cur: Word[] = [];
    let curW = 0;
    let idx = 0;
    const pushLine = () => { lines.push({ words: cur, width: curW }); cur = []; curW = 0; };
    for (const tok of tokens) {
      if (tok.br) { pushLine(); continue; }
      const pieces = breakLongWord(ctx, tok.text, boxW);
      for (const piece of pieces) {
        const w = ctx.measureText(piece).width;
        const word: Word = { text: piece, emph: tok.emph, dir: wordDirection(piece), width: w, index: idx++ };
        const needed = cur.length ? curW + spaceWidth + w : w;
        if (cur.length && needed > boxW) { pushLine(); cur = [word]; curW = w; }
        else { cur.push(word); curW = needed; }
      }
    }
    if (cur.length || lines.length === 0) pushLine();
    const lineHeightPx = size * lineHeightMul;
    const height = lines.length * lineHeightPx;
    const width = Math.max(0, ...lines.map((l) => l.width));
    result = { font: ctx.font, fontSize: size, lineHeightPx, spaceWidth, lines, dir, height, width, wordCount: idx };
    const tooManyLines = style.maxLines !== undefined && lines.length > style.maxLines;
    const overflow = height > boxH * 1.001 || width > boxW * 1.001;
    if (!(style.autoFit ?? true) || (!tooManyLines && !overflow) || size <= minSize) break;
    size = Math.max(minSize, size * 0.92);
  }
  if (layoutCache.size > 800) layoutCache.clear();
  layoutCache.set(key, result!);
  return result!;
}

function breakLongWord(ctx: Measurer, word: string, maxW: number): string[] {
  if (ctx.measureText(word).width <= maxW) return [word];
  const chars = Array.from(word);
  const out: string[] = [];
  let cur = '';
  for (const ch of chars) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Visual (left-to-right) order of words in a line, using simplified bidi:
 * neutral words take the paragraph direction unless surrounded by the
 * opposite direction; same-direction neighbours form runs; runs are ordered
 * by the paragraph direction, words inside RTL runs are reversed.
 */
export function visualOrder(words: Word[], paraDir: Dir): Array<Word & { resolved: Dir }> {
  const resolved: Dir[] = words.map((w, i) => {
    if (w.dir !== 'neutral') return w.dir as Dir;
    const prev = words.slice(0, i).reverse().find((x) => x.dir !== 'neutral')?.dir as Dir | undefined;
    const next = words.slice(i + 1).find((x) => x.dir !== 'neutral')?.dir as Dir | undefined;
    if (prev && next && prev === next) return prev;
    if (/^[\d.,%+\-:/]+$/.test(w.text) && (prev === 'ltr' || next === 'ltr') && paraDir === 'rtl') return 'ltr';
    return paraDir;
  });
  const runs: Array<{ dir: Dir; items: Array<Word & { resolved: Dir }> }> = [];
  words.forEach((w, i) => {
    const d = resolved[i];
    const last = runs[runs.length - 1];
    const item = { ...w, resolved: d };
    if (last && last.dir === d) last.items.push(item); else runs.push({ dir: d, items: [item] });
  });
  const ordered = paraDir === 'rtl' ? [...runs].reverse() : runs;
  return ordered.flatMap((r) => (r.dir === 'rtl' ? [...r.items].reverse() : r.items));
}

/** Left x of a line inside a box for the given alignment and direction. */
export function lineStartX(lineWidth: number, boxX: number, boxW: number, align: TextStyle['align'], dir: Dir): number {
  const a = align ?? 'center';
  if (a === 'center') return boxX + (boxW - lineWidth) / 2;
  const startIsLeft = (a === 'start') === (dir === 'ltr');
  return startIsLeft ? boxX : boxX + boxW - lineWidth;
}

export function blockStartY(height: number, boxY: number, boxH: number, valign: TextStyle['valign']): number {
  const v = valign ?? 'middle';
  if (v === 'top') return boxY;
  if (v === 'bottom') return boxY + boxH - height;
  return boxY + (boxH - height) / 2;
}
