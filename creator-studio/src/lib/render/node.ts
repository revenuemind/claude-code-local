/**
 * Server-side rendering: registers bundled fonts with Skia, resolves media,
 * streams frames to FFmpeg, mixes audio and writes subtitles/thumbnails.
 * Server-only (imports native @napi-rs/canvas and child_process).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createCanvas, GlobalFonts, loadImage, ImageData, type Image, type Canvas } from '@napi-rs/canvas';
import type { AudioClip, CaptionClip, Composition, ImageClip, VideoClip } from '../composition/types';
import { renderFrame, type MediaSource, type Drawable } from './renderer';
import { FFMPEG, probe, run } from '../media/ffmpeg';
import { synthesizeMusic, encodeWav } from '../audio/synth';
import { captionChunks } from './renderer';

let fontsRegistered = false;
export function fontsDir(): string {
  return process.env.FONTS_DIR || path.resolve(process.cwd(), 'assets/fonts');
}
export function registerFonts(): void {
  if (fontsRegistered) return;
  const dir = fontsDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Array<{ family: string; file: string }>;
  for (const f of manifest) GlobalFonts.registerFromPath(path.join(dir, f.file), f.family);
  fontsRegistered = true;
}

export interface ResolvedAsset { path: string; kind: string }
export type AssetResolver = (assetId: string) => Promise<ResolvedAsset | null> | ResolvedAsset | null;

// ───────────────────────── Media for Skia ─────────────────────────

class VideoDecoder {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf: Buffer = Buffer.alloc(0);
  private index = -1;
  private ended = false;
  private waiters: Array<() => void> = [];
  readonly frameBytes: number;
  current: Canvas | null = null;
  constructor(private file: string, private trimInMs: number, private fps: number, private speed: number, readonly w: number, readonly h: number) {
    this.frameBytes = w * h * 4;
  }
  private start() {
    const rate = Math.max(1, this.fps / this.speed);
    this.proc = spawn(FFMPEG, [
      '-v', 'error', '-ss', (this.trimInMs / 1000).toFixed(3), '-i', this.file,
      '-vf', `fps=${rate.toFixed(4)},scale=${this.w}:${this.h}:force_original_aspect_ratio=increase,crop=${this.w}:${this.h}`,
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
    ]);
    this.proc.stdout.on('data', (d: Buffer) => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : Buffer.from(d); this.flush(); if (this.buf.length > this.frameBytes * 6) this.proc?.stdout.pause(); });
    this.proc.on('close', () => { this.ended = true; this.flush(); });
    this.proc.stderr.on('data', () => {});
  }
  private flush() { const w = this.waiters; this.waiters = []; w.forEach((f) => f()); }
  private async nextFrame(): Promise<boolean> {
    if (!this.proc) this.start();
    while (this.buf.length < this.frameBytes) {
      if (this.ended) return false;
      this.proc?.stdout.resume();
      await new Promise<void>((r) => this.waiters.push(r));
    }
    const frame = this.buf.subarray(0, this.frameBytes);
    this.buf = this.buf.subarray(this.frameBytes);
    if (!this.current) this.current = createCanvas(this.w, this.h);
    const ctx = this.current.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.buffer, frame.byteOffset, frame.byteLength), this.w, this.h), 0, 0);
    this.index++;
    return true;
  }
  async seekTo(k: number) {
    while (this.index < k) if (!(await this.nextFrame())) break;
  }
  close() { this.proc?.kill('SIGKILL'); this.proc = null; }
}

export class NodeMedia implements MediaSource {
  images = new Map<string, Image>();
  decoders = new Map<string, VideoDecoder>();
  paths = new Map<string, string>();
  constructor(private comp: Composition, private W: number, private H: number) {}

  static async load(comp: Composition, resolve: AssetResolver, W: number, H: number): Promise<NodeMedia> {
    const m = new NodeMedia(comp, W, H);
    for (const t of comp.tracks) {
      if (t.kind !== 'visual' || t.hidden) continue;
      for (const c of t.clips) {
        if ((c.type === 'image' || c.type === 'video') && c.media.assetId) {
          const r = await resolve(c.media.assetId);
          if (!r) continue;
          m.paths.set(c.id, r.path);
          if (c.type === 'image' && !m.images.has(r.path)) {
            try { m.images.set(r.path, await loadImage(fs.readFileSync(r.path))); } catch { /* unsupported image → placeholder */ }
          }
        }
      }
    }
    return m;
  }
  image(clip: ImageClip): Drawable | null {
    const p = this.paths.get(clip.id);
    return (p && (this.images.get(p) as unknown as Drawable)) || null;
  }
  videoFrame(clip: VideoClip): Drawable | null {
    return (this.decoders.get(clip.id)?.current as unknown as Drawable) ?? null;
  }
  /** Advance video decoders so `videoFrame` returns the right frame for time t. */
  async prepare(t: number, fps: number) {
    for (const tr of this.comp.tracks) {
      if (tr.kind !== 'visual' || tr.hidden) continue;
      for (const c of tr.clips) {
        if (c.type !== 'video') continue;
        const p = this.paths.get(c.id);
        if (!p) continue;
        const end = c.start + c.duration;
        if (t < c.start || t > end + 2500) {
          if (t > end + 2500) { this.decoders.get(c.id)?.close(); }
          continue;
        }
        let d = this.decoders.get(c.id);
        if (!d) {
          const bw = Math.max(16, Math.round((c.box.w * this.W) / 2) * 2);
          const bh = Math.max(16, Math.round((c.box.h * this.H) / 2) * 2);
          d = new VideoDecoder(p, c.trimIn, fps, c.speed, bw, bh);
          this.decoders.set(c.id, d);
        }
        const k = Math.floor(((Math.min(t, end) - c.start) * fps) / 1000);
        await d.seekTo(k);
      }
    }
  }
  close() { for (const d of this.decoders.values()) d.close(); }
}

// ───────────────────────── Stills ─────────────────────────

export async function renderStill(comp: Composition, tMs: number, opts: { width?: number; height?: number; resolve?: AssetResolver; format?: 'png' | 'jpeg' } = {}): Promise<Buffer> {
  registerFonts();
  const W = opts.width ?? comp.width; const H = opts.height ?? comp.height;
  const canvas = createCanvas(W, H);
  const media = opts.resolve ? await NodeMedia.load(comp, opts.resolve, W, H) : undefined;
  try {
    if (media) await media.prepare(tMs, comp.fps);
    renderFrame(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, comp, tMs, W, H, { media });
    return opts.format === 'jpeg' ? canvas.toBuffer('image/jpeg', 88) : canvas.toBuffer('image/png');
  } finally { media?.close(); }
}

// ───────────────────────── Subtitles ─────────────────────────

const ts = (ms: number, sep: ',' | '.') => {
  const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); const r = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
};

export function subtitleCues(comp: Composition): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  for (const t of comp.tracks) {
    if (t.hidden) continue;
    for (const c of t.clips) {
      if (c.type !== 'caption') continue;
      const cap = c as CaptionClip;
      for (const ch of captionChunks(cap.words, Math.max(cap.wordsPerLine ?? 3, 5))) {
        const start = cap.start + ch.start; const end = Math.min(cap.start + cap.duration, cap.start + ch.end);
        if (end > start) cues.push({ start, end, text: ch.idx.map((i) => cap.words[i].text.replace(/\*/g, '')).join(' ') });
      }
    }
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function toSrt(comp: Composition): string {
  return subtitleCues(comp).map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
}
export function toVtt(comp: Composition): string {
  return 'WEBVTT\n\n' + subtitleCues(comp).map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
}

// ───────────────────────── Audio mix ─────────────────────────

export async function mixAudio(comp: Composition, resolve: AssetResolver, outWav: string, tmpDir: string, signal?: AbortSignal): Promise<{ inputs: number }> {
  const total = comp.durationMs;
  const inputs: string[] = [];
  const voiceChains: string[] = [];
  const musicChains: Array<{ label: string; duck: boolean }> = [];
  const otherChains: string[] = [];
  const filters: string[] = [];
  let idx = 0;
  const chain = (i: number, start: number, dur: number, trimIn: number, vol: number, fi = 0, fo = 0) => {
    const parts = [`[${i}:a]atrim=start=${(trimIn / 1000).toFixed(3)}:duration=${(dur / 1000).toFixed(3)}`, 'asetpts=PTS-STARTPTS', 'aresample=44100', 'aformat=channel_layouts=stereo', `volume=${vol.toFixed(3)}`];
    if (fi > 0) parts.push(`afade=t=in:st=0:d=${(fi / 1000).toFixed(3)}`);
    if (fo > 0) parts.push(`afade=t=out:st=${Math.max(0, (dur - fo) / 1000).toFixed(3)}:d=${(fo / 1000).toFixed(3)}`);
    parts.push(`adelay=${Math.round(start)}|${Math.round(start)}`);
    return parts.join(',');
  };
  for (const t of comp.tracks) {
    if (t.muted) continue;
    const tv = t.volume ?? 1;
    for (const c of t.clips) {
      if (c.type === 'audio') {
        const a = c as AudioClip;
        let file: string | null = null;
        if (a.media.assetId) file = (await resolve(a.media.assetId))?.path ?? null;
        if (!file && a.procedural) {
          const { samples, sampleRate } = synthesizeMusic({ mood: a.procedural.mood, bpm: a.procedural.bpm, durationMs: a.duration + a.trimIn, seed: a.procedural.seed });
          file = path.join(tmpDir, `synth_${a.id}.wav`);
          fs.writeFileSync(file, encodeWav(samples, sampleRate));
        }
        if (!file) continue;
        inputs.push('-i', file);
        const label = `a${idx}`;
        filters.push(`${chain(idx, a.start, a.duration, a.trimIn, a.volume * tv, a.fadeInMs, a.fadeOutMs)}[${label}]`);
        if (a.role === 'voiceover') voiceChains.push(label); else if (a.role === 'music') musicChains.push({ label, duck: !!a.duckUnderVoice }); else otherChains.push(label);
        idx++;
      } else if (c.type === 'video' && !c.muted && c.volume > 0 && c.media.assetId && t.kind === 'visual' && !t.hidden) {
        const r = await resolve(c.media.assetId);
        if (!r) continue;
        const info = await probe(r.path).catch(() => null);
        if (!info?.hasAudio) continue;
        inputs.push('-i', r.path);
        const label = `a${idx}`;
        filters.push(`${chain(idx, c.start, c.duration, c.trimIn, c.volume, 0, 120).replace('asetpts=PTS-STARTPTS', `asetpts=PTS-STARTPTS,atempo=${Math.min(2, Math.max(0.5, c.speed))}`)}[${label}]`);
        otherChains.push(label);
        idx++;
      }
    }
  }
  const dur = (total / 1000).toFixed(3);
  if (idx === 0) {
    await run(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', dur, outWav], { signal, timeoutMs: 120_000 });
    return { inputs: 0 };
  }
  const mixOf = (labels: string[], out: string) => {
    if (labels.length === 1) filters.push(`[${labels[0]}]anull[${out}]`);
    else filters.push(`${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[${out}]`);
  };
  const finalLabels: string[] = [];
  if (voiceChains.length) mixOf(voiceChains, 'vo');
  if (musicChains.length) {
    mixOf(musicChains.map((m) => m.label), 'mu');
    if (voiceChains.length && musicChains.some((m) => m.duck)) {
      filters.push('[vo]asplit=2[vo1][vo2]');
      filters.push('[mu][vo2]sidechaincompress=threshold=0.04:ratio=6:attack=30:release=450[mud]');
      finalLabels.push('vo1', 'mud');
    } else { if (voiceChains.length) finalLabels.push('vo'); finalLabels.push('mu'); }
  } else if (voiceChains.length) finalLabels.push('vo');
  finalLabels.push(...otherChains);
  filters.push(`${finalLabels.map((l) => `[${l}]`).join('')}amix=inputs=${finalLabels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${dur},alimiter=limit=0.95[out]`);
  await run(FFMPEG, ['-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '44100', '-ac', '2', outWav], { signal, timeoutMs: 30 * 60_000 });
  return { inputs: idx };
}

// ───────────────────────── Video export ─────────────────────────

export interface ExportOptions {
  outPath: string;
  width?: number;
  height?: number;
  fps?: number;
  resolve: AssetResolver;
  crf?: number;
  preset?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  watermark?: string | null;
}

export interface ExportResult { outPath: string; durationMs: number; frames: number; width: number; height: number; audioInputs: number }

export async function exportVideo(comp: Composition, opts: ExportOptions): Promise<ExportResult> {
  registerFonts();
  const W = even(opts.width ?? comp.width); const H = even(opts.height ?? comp.height);
  const fps = opts.fps ?? comp.fps;
  const frames = Math.max(1, Math.round((comp.durationMs / 1000) * fps));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-render-'));
  const wav = path.join(tmp, 'mix.wav');
  try {
    const { inputs: audioInputs } = await mixAudio(comp, opts.resolve, wav, tmp, opts.signal);
    opts.onProgress?.(0.05);
    const media = await NodeMedia.load(comp, opts.resolve, W, H);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    const ff = spawn(FFMPEG, [
      '-v', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-',
      '-i', wav,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', opts.preset ?? 'veryfast', '-crf', String(opts.crf ?? 20), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', opts.outPath,
    ]);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    const done = new Promise<void>((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (${code}): ${stderr.slice(-2000)}`))));
    });
    const abort = () => ff.kill('SIGKILL');
    opts.signal?.addEventListener('abort', abort);
    try {
      for (let f = 0; f < frames; f++) {
        if (opts.signal?.aborted) throw new Error('render canceled');
        const t = (f * 1000) / fps;
        await media.prepare(t, fps);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        renderFrame(ctx, comp, t, W, H, { media });
        if (opts.watermark) drawWatermark(ctx, opts.watermark, W, H);
        const data = (canvas as Canvas).data();
        if (!ff.stdin.write(data)) await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
        if (f % 15 === 0) opts.onProgress?.(0.05 + 0.93 * (f / frames));
      }
      ff.stdin.end();
      await done;
    } finally {
      opts.signal?.removeEventListener('abort', abort);
      media.close();
    }
    opts.onProgress?.(1);
    return { outPath: opts.outPath, durationMs: comp.durationMs, frames, width: W, height: H, audioInputs };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  const s = Math.min(W, H) / 1080;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.font = `700 ${Math.round(26 * s)}px Inter`; ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.direction = 'ltr';
  ctx.fillText(text, W - 24 * s, H - 20 * s); ctx.restore();
}

function even(n: number) { return Math.max(2, Math.round(n / 2) * 2); }

/** Pick a representative thumbnail time: the middle of the first scene with a headline. */
export function thumbnailTime(comp: Composition): number {
  const text = comp.tracks.find((t) => t.role === 'text')?.clips[0];
  return text ? Math.min(comp.durationMs - 1, text.start + Math.min(1500, text.duration * 0.6)) : comp.durationMs * 0.2;
}
