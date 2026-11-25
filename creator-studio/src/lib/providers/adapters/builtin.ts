/** Built-in engine: procedural music (WAV) and procedural motion-background stills. No external calls. */
import type { MusicMood } from '../../composition/types';
import type { ProviderAdapters } from '../types';
import { synthesizeMusic, encodeWav } from '../../audio/synth';
import { hashString } from '../../render/util';

const MOODS: MusicMood[] = ['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic'];

export function moodFromPrompt(prompt: string): MusicMood {
  const p = prompt.toLowerCase();
  return MOODS.find((m) => p.includes(m)) ?? 'uplifting';
}

export const builtinAdapters: ProviderAdapters = {
  music: {
    async compose(req) {
      const bpm = Number(/(\d{2,3})\s*bpm/i.exec(req.prompt)?.[1] ?? 110);
      const { samples, sampleRate } = synthesizeMusic({ mood: moodFromPrompt(req.prompt), bpm, durationMs: req.durationMs, seed: hashString(req.prompt) % 997 });
      return { audio: encodeWav(samples, sampleRate), mimeType: 'audio/wav' };
    },
  },
  image: {
    async generate(req) {
      // Lazy import keeps the native canvas out of non-render code paths.
      const { renderProceduralStill } = await import('../../render/procedural-still');
      const data = await renderProceduralStill(req.prompt, req.aspect, req.seed);
      return { data, mimeType: 'image/png' };
    },
  },
};
