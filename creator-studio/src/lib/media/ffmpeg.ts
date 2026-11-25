/** Thin, safe wrappers around the ffmpeg / ffprobe binaries (argument arrays, never shell strings). */
import { spawn } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export interface ProbeResult {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  fps: number | null;
  codec: string | null;
}

export function run(bin: string, args: string[], opts: { input?: Buffer; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = opts.timeoutMs ? setTimeout(() => p.kill('SIGKILL'), opts.timeoutMs) : null;
    const onAbort = () => p.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 200_000) err = err.slice(-100_000); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${bin} exited with ${code}: ${err.split('\n').slice(-8).join('\n')}`));
    });
    if (opts.input) p.stdin.end(opts.input); else p.stdin.end();
  });
}

export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { timeoutMs: 30_000 });
  const j = JSON.parse(stdout.toString()) as { format?: { duration?: string }; streams?: Array<{ codec_type: string; width?: number; height?: number; duration?: string; r_frame_rate?: string; codec_name?: string }> };
  const v = j.streams?.find((s) => s.codec_type === 'video');
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const dur = parseFloat(j.format?.duration ?? v?.duration ?? a?.duration ?? '');
  let fps: number | null = null;
  if (v?.r_frame_rate) { const [n, d] = v.r_frame_rate.split('/').map(Number); if (d) fps = n / d; }
  return {
    durationMs: Number.isFinite(dur) ? Math.round(dur * 1000) : null,
    width: v?.width ?? null, height: v?.height ?? null,
    hasVideo: !!v && v.codec_name !== 'mjpeg' && v.codec_name !== 'png', hasAudio: !!a, fps, codec: v?.codec_name ?? a?.codec_name ?? null,
  };
}

export async function ffmpegAvailable(): Promise<boolean> {
  try { await run(FFMPEG, ['-version'], { timeoutMs: 10_000 }); return true; } catch { return false; }
}
