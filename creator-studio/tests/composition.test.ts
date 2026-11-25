import { describe, expect, it } from 'vitest';
import type { Composition, VideoClip, CaptionClip, TextClip } from '../src/lib/composition/types';
import { addClip, splitClip, trimClip, moveClip, duplicateClip, removeClip, findClip, setSpeed, History, computeDuration, updateTrack, moveTrack } from '../src/lib/composition/ops';
import { parseComposition, compositionSchema } from '../src/lib/composition/schema';

function base(): Composition {
  const video: VideoClip = { id: 'v1', type: 'video', start: 0, duration: 4000, media: { assetId: 'a1' }, box: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', trimIn: 1000, speed: 1, volume: 1, sourceDurationMs: 10000 };
  const cap: CaptionClip = { id: 'c1', type: 'caption', start: 0, duration: 4000, words: [{ text: 'a', start: 0, end: 900 }, { text: 'b', start: 1000, end: 1900 }, { text: 'c', start: 2500, end: 3500 }], box: { x: 0, y: 0.7, w: 1, h: 0.1 }, preset: 'karaoke', style: { fontFamily: 'Inter', fontWeight: 800, fontSize: 60, color: '#fff' } };
  const text: TextClip = { id: 't1', type: 'text', start: 500, duration: 2000, text: 'Hi', box: { x: 0.1, y: 0.1, w: 0.8, h: 0.2 }, style: { fontFamily: 'Inter', fontWeight: 800, fontSize: 60, color: '#fff' } };
  return {
    version: 1, width: 1080, height: 1920, fps: 30, durationMs: 4000, background: '#000000',
    tracks: [
      { id: 'tv', kind: 'visual', name: 'Video', clips: [video] },
      { id: 'tt', kind: 'visual', name: 'Text', clips: [text] },
      { id: 'tc', kind: 'visual', name: 'Captions', clips: [cap] },
      { id: 'ta', kind: 'audio', name: 'Audio', clips: [] },
    ],
  };
}

describe('composition ops', () => {
  it('split keeps source continuity for video and partitions caption words', () => {
    const { comp, rightId } = splitClip(base(), 'v1', 1500);
    const left = findClip(comp, 'v1')!.clip as VideoClip;
    const right = findClip(comp, rightId!)!.clip as VideoClip;
    expect(left.duration).toBe(1500);
    expect(right.start).toBe(1500);
    expect(right.trimIn).toBe(2500);
    const c = splitClip(base(), 'c1', 2000);
    const cl = findClip(c.comp, 'c1')!.clip as CaptionClip;
    const cr = findClip(c.comp, c.rightId!)!.clip as CaptionClip;
    expect(cl.words.map((w) => w.text)).toEqual(['a', 'b']);
    expect(cr.words.map((w) => w.text)).toEqual(['c']);
    expect(cr.words[0].start).toBe(500);
  });

  it('refuses splits at the clip edges', () => {
    expect(splitClip(base(), 'v1', 10).rightId).toBeNull();
    expect(splitClip(base(), 'v1', 3990).rightId).toBeNull();
  });

  it('trims heads (advancing trimIn) and tails (bounded by source length)', () => {
    let c = trimClip(base(), 'v1', 'start', 1000);
    let v = findClip(c, 'v1')!.clip as VideoClip;
    expect([v.start, v.duration, v.trimIn]).toEqual([1000, 3000, 2000]);
    c = trimClip(base(), 'v1', 'end', 60_000);
    v = findClip(c, 'v1')!.clip as VideoClip;
    expect(v.duration).toBe(9000); // 10s source - 1s trimIn
    c = trimClip(base(), 'v1', 'end', 0);
    expect((findClip(c, 'v1')!.clip).duration).toBe(100);
  });

  it('moves between tracks of the same kind only', () => {
    let c = moveClip(base(), 't1', 1000, 'tc');
    expect(findClip(c, 't1')!.track.id).toBe('tc');
    c = moveClip(base(), 't1', 1000, 'ta');
    expect(findClip(c, 't1')!.track.id).toBe('tt');
    expect(() => addClip(base(), 'ta', findClip(base(), 't1')!.clip)).toThrow();
  });

  it('duplicate, remove, speed and duration bookkeeping', () => {
    const d = duplicateClip(base(), 't1');
    expect(findClip(d.comp, d.newId)!.clip.start).toBe(2500);
    expect(removeClip(base(), 't1').tracks[1].clips).toHaveLength(0);
    const s = setSpeed(base(), 'v1', 2);
    expect(findClip(s, 'v1')!.clip.duration).toBe(2000);
    expect(computeDuration(d.comp)).toBe(4500);
    expect(updateTrack(base(), 'tv', { hidden: true }).tracks[0].hidden).toBe(true);
    expect(moveTrack(base(), 'tt', -1).tracks[0].id).toBe('tt');
  });

  it('undo/redo history with coalescing', () => {
    const h = new History(1);
    h.push(2); h.push(3); h.replace(4);
    expect(h.undo()).toBe(2);
    expect(h.redo()).toBe(4);
    expect(h.canRedo).toBe(false);
    h.undo(); h.undo();
    expect(h.present).toBe(1);
    expect(h.canUndo).toBe(false);
  });

  it('schema validation accepts valid timelines and rejects bad input; client paths are stripped', () => {
    const c = base();
    (c.tracks[0].clips[0] as VideoClip).media.src = '/etc/passwd';
    const parsed = parseComposition(c);
    expect((parsed.tracks[0].clips[0] as VideoClip).media.src).toBeUndefined();
    expect(compositionSchema.safeParse({ ...base(), width: 99999 }).success).toBe(false);
    expect(compositionSchema.safeParse({ ...base(), background: 'url(javascript:alert(1))' }).success).toBe(false);
    const bad = base(); (bad.tracks[1].clips[0] as TextClip).duration = 0;
    expect(compositionSchema.safeParse(bad).success).toBe(false);
  });
});
