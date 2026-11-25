/** Web Audio preview of a composition's audio tracks (voiceover, music, procedural beds). */
import type { AudioClip, Composition } from '../composition/types';
import { synthesizeMusic } from '../audio/synth';
import { assetUrl } from './api';

export class AudioPreview {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private sources: AudioScheduledSourceNode[] = [];

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private bufferFor(clip: AudioClip): Promise<AudioBuffer | null> {
    const ctx = this.context();
    if (clip.media.assetId) {
      const key = `asset:${clip.media.assetId}`;
      if (!this.buffers.has(key)) {
        this.buffers.set(key, fetch(assetUrl(clip.media.assetId), { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => ctx.decodeAudioData(b)).catch(() => null));
      }
      return this.buffers.get(key)!;
    }
    if (clip.procedural && clip.duration + clip.trimIn <= 600_000) {
      const p = clip.procedural;
      const key = `synth:${p.mood}:${p.bpm}:${p.seed}:${clip.duration + clip.trimIn}`;
      if (!this.buffers.has(key)) {
        this.buffers.set(key, new Promise((resolve) => setTimeout(() => {
          const { samples, sampleRate } = synthesizeMusic({ mood: p.mood, bpm: p.bpm, durationMs: clip.duration + clip.trimIn, seed: p.seed, sampleRate: 22050 });
          const n = samples.length / 2;
          const buf = ctx.createBuffer(2, n, sampleRate);
          const l = buf.getChannelData(0); const r = buf.getChannelData(1);
          for (let i = 0; i < n; i++) { l[i] = samples[i * 2]; r[i] = samples[i * 2 + 1]; }
          resolve(buf);
        }, 0)));
      }
      return this.buffers.get(key)!;
    }
    return Promise.resolve(null);
  }

  /** Warm caches so playback starts in sync. */
  async prepare(comp: Composition) {
    const clips = comp.tracks.filter((t) => t.kind === 'audio' && !t.muted).flatMap((t) => t.clips as AudioClip[]);
    await Promise.all(clips.map((c) => this.bufferFor(c)));
  }

  async start(comp: Composition, fromMs: number) {
    this.stop();
    const ctx = this.context();
    const t0 = ctx.currentTime + 0.05;
    const hasVoice = comp.tracks.some((t) => t.role === 'voiceover' && !t.muted && t.clips.length);
    for (const track of comp.tracks) {
      if (track.kind !== 'audio' || track.muted) continue;
      for (const c of track.clips as AudioClip[]) {
        const end = c.start + c.duration;
        if (end <= fromMs) continue;
        const buf = await this.bufferFor(c);
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        const vol = c.volume * (track.volume ?? 1) * (c.role === 'music' && hasVoice && c.duckUnderVoice ? 0.7 : 1);
        const delay = Math.max(0, c.start - fromMs) / 1000;
        const offset = (Math.max(0, fromMs - c.start) + c.trimIn) / 1000;
        const dur = (end - Math.max(fromMs, c.start)) / 1000;
        gain.gain.setValueAtTime(vol, t0);
        if (c.fadeInMs && fromMs <= c.start) { gain.gain.setValueAtTime(0, t0 + delay); gain.gain.linearRampToValueAtTime(vol, t0 + delay + c.fadeInMs / 1000); }
        if (c.fadeOutMs) { const fs = t0 + delay + Math.max(0, dur - c.fadeOutMs / 1000); gain.gain.setValueAtTime(vol, fs); gain.gain.linearRampToValueAtTime(0, fs + c.fadeOutMs / 1000); }
        src.connect(gain).connect(ctx.destination);
        if (offset < buf.duration) { src.start(t0 + delay, offset, dur); this.sources.push(src); }
      }
    }
  }

  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources = [];
  }

  dispose() { this.stop(); void this.ctx?.close(); this.ctx = null; this.buffers.clear(); }
}
