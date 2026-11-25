/**
 * Procedural music beds for Code-Only production: a deterministic synth that
 * writes a WAV with chord pads, bass and (mood-dependent) light percussion.
 * No samples, no external services, royalty-free by construction.
 */
import type { MusicMood } from '../composition/types';
import { rng } from '../render/util';

interface MoodSpec { scale: 'major' | 'minor'; progression: number[]; drums: number; brightness: number; bassLevel: number }

const MOODS: Record<MusicMood, MoodSpec> = {
  uplifting: { scale: 'major', progression: [0, 4, 5, 3], drums: 0.7, brightness: 0.8, bassLevel: 0.5 },
  calm: { scale: 'major', progression: [0, 5, 3, 4], drums: 0, brightness: 0.4, bassLevel: 0.35 },
  dramatic: { scale: 'minor', progression: [0, 5, 2, 6], drums: 0.4, brightness: 0.5, bassLevel: 0.6 },
  energetic: { scale: 'minor', progression: [0, 5, 6, 4], drums: 1, brightness: 0.9, bassLevel: 0.65 },
  luxury: { scale: 'minor', progression: [0, 3, 6, 4], drums: 0.25, brightness: 0.45, bassLevel: 0.45 },
  dark: { scale: 'minor', progression: [0, 5, 0, 6], drums: 0.3, brightness: 0.3, bassLevel: 0.7 },
  playful: { scale: 'major', progression: [0, 3, 4, 0], drums: 0.8, brightness: 1, bassLevel: 0.45 },
  inspiring: { scale: 'major', progression: [5, 3, 0, 4], drums: 0.45, brightness: 0.7, bassLevel: 0.5 },
  corporate: { scale: 'major', progression: [0, 4, 5, 3], drums: 0.55, brightness: 0.65, bassLevel: 0.45 },
  cinematic: { scale: 'minor', progression: [0, 6, 3, 5], drums: 0.2, brightness: 0.5, bassLevel: 0.6 },
};

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface SynthOptions { mood: MusicMood; bpm: number; durationMs: number; seed?: number; sampleRate?: number }

/** Returns interleaved stereo Float32 samples in [-1, 1]. */
export function synthesizeMusic(opts: SynthOptions): { samples: Float32Array; sampleRate: number } {
  const sr = opts.sampleRate ?? 32000;
  const spec = MOODS[opts.mood] ?? MOODS.uplifting;
  const n = Math.ceil((opts.durationMs / 1000) * sr);
  const out = new Float32Array(n * 2);
  const R = rng(opts.seed ?? 1);
  const root = 48 + Math.floor(R() * 7); // C3..F#3
  const scale = SCALES[spec.scale];
  const beat = 60 / Math.max(50, Math.min(200, opts.bpm));
  const bar = beat * 4;
  const degreeNote = (deg: number, octave = 0) => root + 12 * (Math.floor(deg / 7) + octave) + scale[((deg % 7) + 7) % 7];

  const voices: Array<{ f: number; ph: number; det: number }> = [];
  let chordIdx = -1;
  let noiseState = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const barIdx = Math.floor(t / bar);
    const ci = barIdx % spec.progression.length;
    if (ci !== chordIdx || voices.length === 0) {
      chordIdx = ci;
      const d = spec.progression[ci];
      const notes = [degreeNote(d, 1), degreeNote(d + 2, 1), degreeNote(d + 4, 1), degreeNote(d + 7, 1)];
      voices.length = 0;
      for (const m of notes) for (const det of [-0.0035, 0.0035]) voices.push({ f: midiHz(m) * (1 + det), ph: R() * Math.PI * 2, det });
    }
    const tb = t - barIdx * bar;
    // Pad: soft attack per bar, slow swell.
    const padEnv = Math.min(1, tb / 0.6) * (0.75 + 0.25 * Math.sin(t * 0.7));
    let pad = 0;
    for (const v of voices) {
      const ph = v.ph + 2 * Math.PI * v.f * t;
      pad += Math.sin(ph) + spec.brightness * 0.25 * Math.sin(2 * ph) + spec.brightness * 0.08 * Math.sin(3 * ph);
    }
    pad = (pad / voices.length) * 0.22 * padEnv;
    // Bass: root on each beat with exponential decay.
    const tbeat = t % beat;
    const bassHz = midiHz(degreeNote(spec.progression[ci], -1));
    const bass = Math.sin(2 * Math.PI * bassHz * t) * Math.exp(-tbeat * 2.2) * spec.bassLevel * 0.35;
    // Arp sparkle on eighths for brighter moods.
    let arp = 0;
    if (spec.brightness > 0.6) {
      const eighth = beat / 2;
      const k = Math.floor(t / eighth);
      const te = t - k * eighth;
      const deg = spec.progression[ci] + [0, 2, 4, 7][k % 4];
      arp = Math.sin(2 * Math.PI * midiHz(degreeNote(deg, 2)) * t) * Math.exp(-te * 9) * 0.07 * spec.brightness;
    }
    // Drums: kick on 1 & 3, hat on offbeats.
    let drums = 0;
    if (spec.drums > 0) {
      const beatIdx = Math.floor(t / beat) % 4;
      if (beatIdx === 0 || beatIdx === 2) {
        const f = 50 + 90 * Math.exp(-tbeat * 30);
        drums += Math.sin(2 * Math.PI * f * tbeat) * Math.exp(-tbeat * 9) * 0.5 * spec.drums;
      }
      const th = (t + beat / 2) % beat;
      noiseState = noiseState * 0.35 + (R() * 2 - 1) * 0.65;
      drums += (R() * 2 - 1 - noiseState) * Math.exp(-th * 60) * 0.12 * spec.drums;
    }
    const sample = pad + bass + arp + drums;
    const pan = 0.1 * Math.sin(t * 0.5);
    out[i * 2] = Math.tanh(sample * (1 - pan) * 1.2) * 0.8;
    out[i * 2 + 1] = Math.tanh(sample * (1 + pan) * 1.2) * 0.8;
  }
  return { samples: out, sampleRate: sr };
}

export function encodeWav(samples: Float32Array, sampleRate: number, channels = 2): Buffer {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}
