import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { tokenize, detectDirection, visualOrder, layoutText, wordDirection } from '../src/lib/render/text';
import { renderFrame, activeOps, captionChunks, hitTest } from '../src/lib/render/renderer';
import { registerFonts, renderStill, toSrt, toVtt } from '../src/lib/render/node';
import { drawBackground } from '../src/lib/render/backgrounds';
import { synthesizeMusic, encodeWav } from '../src/lib/audio/synth';
import { parseColor, contrastRatio, readableOn, rng } from '../src/lib/render/util';
import type { Composition } from '../src/lib/composition/types';

registerFonts();

describe('text layout & bidi', () => {
  it('tokenizes emphasis across words and line breaks', () => {
    expect(tokenize('a *b c* d\ne')).toEqual([
      { text: 'a', emph: false }, { text: 'b', emph: true }, { text: 'c', emph: true }, { text: 'd', emph: false }, { text: '', emph: false, br: true }, { text: 'e', emph: false },
    ]);
  });
  it('detects direction', () => {
    expect(detectDirection('123 שלום')).toBe('rtl');
    expect(detectDirection('مرحبا')).toBe('rtl');
    expect(detectDirection('ሰላም')).toBe('ltr');
    expect(wordDirection('2026')).toBe('neutral');
  });
  it('keeps embedded LTR phrases in order inside RTL lines', () => {
    const words = ['קניתי', 'iPhone', '15', 'Pro', 'היום'].map((t, i) => ({ text: t, emph: false, dir: wordDirection(t), width: 10, index: i }));
    expect(visualOrder(words, 'rtl').map((w) => w.text)).toEqual(['היום', 'iPhone', '15', 'Pro', 'קניתי']);
    const ltr = ['I', 'love', 'שלום', 'עולם', 'today'].map((t, i) => ({ text: t, emph: false, dir: wordDirection(t), width: 10, index: i }));
    expect(visualOrder(ltr, 'ltr').map((w) => w.text)).toEqual(['I', 'love', 'עולם', 'שלום', 'today']);
  });
  it('wraps and auto-fits text into its box', () => {
    const ctx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D;
    const style = { fontFamily: 'Inter', fontWeight: 800, fontSize: 120, color: '#fff', autoFit: true, maxLines: 3 };
    const l = layoutText(ctx, 'This is a fairly long headline that must wrap onto several lines', style, 500, 300, 1);
    expect(l.lines.length).toBeLessThanOrEqual(3);
    expect(l.height).toBeLessThanOrEqual(300.5);
    expect(l.width).toBeLessThanOrEqual(500.5);
    expect(l.fontSize).toBeLessThan(120);
  });
});

describe('renderer', () => {
  const comp: Composition = {
    version: 1, width: 360, height: 640, fps: 30, durationMs: 3000, background: '#000000',
    tracks: [
      { id: 'bg', kind: 'visual', name: 'bg', clips: [
        { id: 'b1', type: 'background', start: 0, duration: 1500, style: { kind: 'solid', colors: ['#ff0000'] } },
        { id: 'b2', type: 'background', start: 1500, duration: 1500, style: { kind: 'solid', colors: ['#0000ff'] }, transition: { type: 'crossfade', durationMs: 600 } },
      ] },
      { id: 'tx', kind: 'visual', name: 'tx', clips: [{ id: 't', type: 'text', start: 0, duration: 3000, text: 'שלום *עולם*', box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 }, style: { fontFamily: 'Rubik', fontWeight: 800, fontSize: 120, color: '#ffffff', highlightColor: '#ffff00' } }] },
      { id: 'cp', kind: 'visual', name: 'cp', clips: [{ id: 'c', type: 'caption', start: 0, duration: 3000, preset: 'bold-pop', box: { x: 0, y: 0.8, w: 1, h: 0.1 }, words: [{ text: 'hello', start: 0, end: 800 }, { text: 'world', start: 800, end: 1600 }], style: { fontFamily: 'Inter', fontWeight: 800, fontSize: 60, color: '#fff' } }] },
    ],
  };
  const pixel = (t: number, x: number, y: number) => {
    const c = createCanvas(360, 640); const ctx = c.getContext('2d');
    renderFrame(ctx as unknown as CanvasRenderingContext2D, comp, t, 360, 640);
    return [...ctx.getImageData(x, y, 1, 1).data];
  };
  it('crossfade transitions blend the outgoing and incoming clips', () => {
    expect(pixel(500, 5, 5)).toEqual([255, 0, 0, 255]);
    const mid = pixel(1800, 5, 5);
    expect(mid[0]).toBeGreaterThan(40); expect(mid[2]).toBeGreaterThan(40);
    expect(pixel(2500, 5, 5)).toEqual([0, 0, 255, 255]);
    expect(activeOps(comp.tracks[0], 1800).map((o) => o.role)).toEqual(['out', 'in']);
  });
  it('draws text and highlighted emphasis (yellow) in an RTL line', () => {
    const c = createCanvas(360, 640); const ctx = c.getContext('2d');
    renderFrame(ctx as unknown as CanvasRenderingContext2D, comp, 1000, 360, 640);
    const d = ctx.getImageData(36, 256, 288, 128).data;
    let white = 0; let yellow = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) white++; if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] < 60) yellow++; }
    expect(white).toBeGreaterThan(50); expect(yellow).toBeGreaterThan(50);
  });
  it('is deterministic: identical frames for identical inputs', async () => {
    const a = await renderStill(comp, 1234, { width: 180, height: 320 });
    const b = await renderStill(comp, 1234, { width: 180, height: 320 });
    expect(Buffer.compare(a, b)).toBe(0);
    const c1 = createCanvas(64, 64); const c2 = createCanvas(64, 64);
    for (const c of [c1, c2]) drawBackground(c.getContext('2d') as unknown as CanvasRenderingContext2D, 64, 64, 777, { kind: 'particles', colors: ['#000', '#123', '#fff'], seed: 3, grain: 0.5 });
    expect(Buffer.compare(c1.data(), c2.data())).toBe(0);
  });
  it('captions chunk, subtitle export and hit testing', () => {
    expect(captionChunks([{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }, { text: 'c', start: 2, end: 3 }], 2).map((c) => c.idx)).toEqual([[0, 1], [2]]);
    expect(toSrt(comp)).toContain('00:00:00,000 --> 00:00:01,600\nhello world');
    expect(toVtt(comp).startsWith('WEBVTT')).toBe(true);
    expect(hitTest(comp, 1000, 0.5, 0.5)?.id).toBe('t');
    expect(hitTest(comp, 1000, 0.01, 0.01)).toBeNull();
  });
});

describe('utilities & audio synth', () => {
  it('colors and contrast', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('rgba(1,2,3,0.5)').a).toBe(0.5);
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
    expect(readableOn('#facc15')).toBe('#0b0b10');
    const r1 = rng(5); const r2 = rng(5);
    expect([r1(), r1()]).toEqual([r2(), r2()]);
  });
  it('procedural music is deterministic, bounded and encodes to WAV', () => {
    const a = synthesizeMusic({ mood: 'energetic', bpm: 120, durationMs: 1000, seed: 4, sampleRate: 8000 });
    const b = synthesizeMusic({ mood: 'energetic', bpm: 120, durationMs: 1000, seed: 4, sampleRate: 8000 });
    expect(a.samples.length).toBe(16000);
    expect(Buffer.from(a.samples.buffer).equals(Buffer.from(b.samples.buffer))).toBe(true);
    expect(Math.max(...a.samples.map(Math.abs))).toBeLessThanOrEqual(1);
    const wav = encodeWav(a.samples, a.sampleRate);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.length).toBe(44 + 32000);
  });
});
