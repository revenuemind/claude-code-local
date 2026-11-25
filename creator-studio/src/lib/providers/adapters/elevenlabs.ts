/** ElevenLabs — multilingual TTS with character timestamps (→ word-accurate captions) and music generation. */
import type { CaptionWord } from '../../composition/types';
import type { ProviderAdapters } from '../types';
import { ProviderError } from '../types';
import { httpJson, httpBuffer, requireCred } from '../http';

const BASE = 'https://api.elevenlabs.io/v1';

/** Convert ElevenLabs character alignment to word timings (ms). */
export function alignmentToWords(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): CaptionWord[] {
  const words: CaptionWord[] = [];
  let cur = ''; let start = 0; let end = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push({ text: cur, start: Math.round(start * 1000), end: Math.round(end * 1000) });
      cur = '';
      return;
    }
    if (!cur) start = a.character_start_times_seconds[i] ?? end;
    cur += ch;
    end = a.character_end_times_seconds[i] ?? end;
  });
  if (cur) words.push({ text: cur, start: Math.round(start * 1000), end: Math.round(end * 1000) });
  return words;
}

export const elevenlabsAdapters: ProviderAdapters = {
  tts: {
    async synthesize(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'elevenlabs');
      const voice = req.voiceId || ctx.config?.defaultVoiceId || 'JBFqnCBsd6RMkjVDRZzb';
      const r = await httpJson<{ audio_base64?: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } }>(
        'elevenlabs', `${BASE}/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, ctx,
        { headers: { 'xi-api-key': key }, body: { text: req.text, model_id: req.model, ...(req.language ? { language_code: req.language } : {}) } },
      );
      if (!r.audio_base64) throw new ProviderError('elevenlabs: no audio returned', 200, true, 'elevenlabs');
      const words = r.alignment ? alignmentToWords(r.alignment) : undefined;
      return { audio: Buffer.from(r.audio_base64, 'base64'), mimeType: 'audio/mpeg', words, durationMs: words?.length ? words[words.length - 1].end : undefined };
    },
  },
  music: {
    async compose(req, ctx) {
      const key = requireCred(ctx, 'apiKey', 'elevenlabs');
      const audio = await httpBuffer('elevenlabs', `${BASE}/music`, ctx, {
        headers: { 'xi-api-key': key },
        body: { prompt: req.prompt, music_length_ms: Math.max(10_000, Math.min(300_000, Math.round(req.durationMs))), model_id: req.model },
      });
      return { audio, mimeType: 'audio/mpeg' };
    },
  },
};
