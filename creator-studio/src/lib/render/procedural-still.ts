/** Renders a procedural background still (built-in "image engine" for Code-Only mode). */
import { createCanvas } from '@napi-rs/canvas';
import { drawBackground } from './backgrounds';
import { hashString } from './util';
import type { BackgroundKind } from '../composition/types';

const KINDS: BackgroundKind[] = ['aurora', 'mesh', 'bokeh', 'rays', 'waves', 'spotlight', 'particles', 'grid'];
const PALETTES = [
  ['#0b1020', '#1d4ed8', '#22d3ee', '#a855f7'], ['#140a05', '#c2410c', '#fbbf24', '#fb7185'],
  ['#04140e', '#15803d', '#a3e635', '#22d3ee'], ['#0a0814', '#7e22ce', '#f472b6', '#facc15'],
];

export async function renderProceduralStill(prompt: string, aspect: string, seed?: number): Promise<Buffer> {
  const [w, h] = aspect === '16:9' ? [1920, 1080] : aspect === '1:1' ? [1080, 1080] : aspect === '4:5' ? [1080, 1350] : [1080, 1920];
  const s = seed ?? hashString(prompt);
  const c = createCanvas(w, h);
  drawBackground(c.getContext('2d') as unknown as CanvasRenderingContext2D, w, h, (s % 10) * 1000, {
    kind: KINDS[s % KINDS.length], colors: PALETTES[(s >>> 3) % PALETTES.length], seed: s % 1000, vignette: 0.4, grain: 0.2,
  });
  return c.toBuffer('image/png');
}
