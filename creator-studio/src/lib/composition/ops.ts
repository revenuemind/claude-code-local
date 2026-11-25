/**
 * Pure, immutable editing operations on compositions. The editor UI calls
 * these and pushes results onto the undo history; the server re-validates
 * the result with `parseComposition` on save.
 */
import type { Clip, Composition, Track, VideoClip, AudioClip, CaptionClip } from './types';

export const MIN_CLIP_MS = 100;

export function uid(prefix = 'c'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function clipEnd(c: { start: number; duration: number }): number {
  return c.start + c.duration;
}

export function computeDuration(comp: Composition): number {
  let end = 0;
  for (const t of comp.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return Math.max(end, MIN_CLIP_MS);
}

export function withDuration(comp: Composition): Composition {
  return { ...comp, durationMs: computeDuration(comp) };
}

export function findClip(comp: Composition, clipId: string): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | null {
  for (let ti = 0; ti < comp.tracks.length; ti++) {
    const track = comp.tracks[ti];
    const ci = track.clips.findIndex((c) => c.id === clipId);
    if (ci >= 0) return { track, clip: track.clips[ci], trackIndex: ti, clipIndex: ci };
  }
  return null;
}

function mapTrack(comp: Composition, trackId: string, fn: (t: Track) => Track): Composition {
  return withDuration({ ...comp, tracks: comp.tracks.map((t) => (t.id === trackId ? fn(t) : t)) });
}

function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.start - b.start);
}

export function updateClip(comp: Composition, clipId: string, patch: Partial<Clip>): Composition {
  const found = findClip(comp, clipId);
  if (!found) return comp;
  return mapTrack(comp, found.track.id, (t) => ({
    ...t,
    clips: sortClips(t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c))),
  }));
}

export function addClip(comp: Composition, trackId: string, clip: Clip): Composition {
  const track = comp.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`track ${trackId} not found`);
  if ((clip.type === 'audio') !== (track.kind === 'audio')) throw new Error('clip type does not match track kind');
  return mapTrack(comp, trackId, (t) => ({ ...t, clips: sortClips([...t.clips, clip]) }));
}

export function removeClip(comp: Composition, clipId: string): Composition {
  const found = findClip(comp, clipId);
  if (!found) return comp;
  return mapTrack(comp, found.track.id, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
}

export function duplicateClip(comp: Composition, clipId: string): { comp: Composition; newId: string } {
  const found = findClip(comp, clipId);
  if (!found) return { comp, newId: clipId };
  const copy = structuredClone(found.clip) as Clip;
  copy.id = uid(found.clip.type.slice(0, 2));
  copy.start = clipEnd(found.clip);
  delete copy.transition;
  return { comp: addClip(comp, found.track.id, copy), newId: copy.id };
}

/** Move a clip in time (and optionally to another track of the same kind). */
export function moveClip(comp: Composition, clipId: string, newStart: number, toTrackId?: string): Composition {
  const found = findClip(comp, clipId);
  if (!found) return comp;
  const start = Math.max(0, Math.round(newStart));
  if (!toTrackId || toTrackId === found.track.id) return updateClip(comp, clipId, { start });
  const target = comp.tracks.find((t) => t.id === toTrackId);
  if (!target || target.kind !== found.track.kind || target.locked) return comp;
  const moved = { ...found.clip, start } as Clip;
  return addClip(removeClip(comp, clipId), toTrackId, moved);
}

/**
 * Trim a clip edge. For media clips, trimming the head advances `trimIn`
 * so the visible content stays anchored to the source.
 */
export function trimClip(comp: Composition, clipId: string, edge: 'start' | 'end', toMs: number): Composition {
  const found = findClip(comp, clipId);
  if (!found) return comp;
  const c = found.clip;
  const end = clipEnd(c);
  if (edge === 'end') {
    let newEnd = Math.max(c.start + MIN_CLIP_MS, Math.round(toMs));
    if (c.type === 'video' && c.sourceDurationMs) {
      const maxEnd = c.start + (c.sourceDurationMs - c.trimIn) / c.speed;
      newEnd = Math.min(newEnd, Math.round(maxEnd));
    }
    return updateClip(comp, clipId, { duration: newEnd - c.start });
  }
  let newStart = Math.min(end - MIN_CLIP_MS, Math.max(0, Math.round(toMs)));
  const delta = newStart - c.start;
  const patch: Partial<Clip> = { start: newStart, duration: end - newStart };
  if (c.type === 'video' || c.type === 'audio') {
    const speed = c.type === 'video' ? c.speed : 1;
    let trimIn = c.trimIn + delta * speed;
    if (trimIn < 0) { newStart -= trimIn / speed; trimIn = 0; patch.start = Math.round(newStart); patch.duration = end - patch.start; }
    (patch as Partial<VideoClip | AudioClip>).trimIn = Math.round(trimIn);
  }
  if (c.type === 'caption') {
    (patch as Partial<CaptionClip>).words = c.words
      .map((w) => ({ ...w, start: w.start - delta, end: w.end - delta }))
      .filter((w) => w.end > 0);
  }
  return updateClip(comp, clipId, patch);
}

/** Split a clip at an absolute time into two clips. */
export function splitClip(comp: Composition, clipId: string, atMs: number): { comp: Composition; rightId: string | null } {
  const found = findClip(comp, clipId);
  if (!found) return { comp, rightId: null };
  const c = found.clip;
  const at = Math.round(atMs);
  if (at <= c.start + MIN_CLIP_MS / 2 || at >= clipEnd(c) - MIN_CLIP_MS / 2) return { comp, rightId: null };
  const leftDur = at - c.start;
  const left = { ...structuredClone(c), duration: leftDur } as Clip;
  delete left.exit;
  const right = { ...structuredClone(c), id: uid(c.type.slice(0, 2)), start: at, duration: clipEnd(c) - at } as Clip;
  delete right.enter;
  delete right.transition;
  if (right.type === 'video') right.trimIn = Math.round(right.trimIn + leftDur * right.speed);
  if (right.type === 'audio') right.trimIn = Math.round(right.trimIn + leftDur);
  if (left.type === 'caption' && right.type === 'caption') {
    left.words = left.words.filter((w) => w.start < leftDur).map((w) => ({ ...w, end: Math.min(w.end, leftDur) }));
    right.words = right.words.filter((w) => w.end > leftDur).map((w) => ({ ...w, start: Math.max(0, w.start - leftDur), end: w.end - leftDur }));
  }
  if (left.type === 'image' && left.kenBurns && right.type === 'image' && right.kenBurns) {
    const f = leftDur / c.duration;
    const mid = lerpKeyframe(left.kenBurns.from, left.kenBurns.to, f);
    left.kenBurns = { from: left.kenBurns.from, to: mid };
    right.kenBurns = { from: mid, to: right.kenBurns.to };
  }
  const next = mapTrack(comp, found.track.id, (t) => ({
    ...t,
    clips: sortClips([...t.clips.filter((x) => x.id !== c.id), left, right]),
  }));
  return { comp: next, rightId: right.id };
}

function lerpKeyframe(a: { at: number; scale: number; x: number; y: number }, b: typeof a, f: number) {
  return { at: 0, scale: a.scale + (b.scale - a.scale) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function setSpeed(comp: Composition, clipId: string, speed: number): Composition {
  const found = findClip(comp, clipId);
  if (!found || found.clip.type !== 'video') return comp;
  const c = found.clip;
  const s = Math.min(8, Math.max(0.1, speed));
  const sourceSpan = c.duration * c.speed;
  return updateClip(comp, clipId, { speed: s, duration: Math.max(MIN_CLIP_MS, Math.round(sourceSpan / s)) } as Partial<VideoClip>);
}

export function addTrack(comp: Composition, track: Omit<Track, 'clips'> & { clips?: Clip[] }, index?: number): Composition {
  const tracks = [...comp.tracks];
  const t: Track = { ...track, clips: track.clips ?? [] };
  if (index === undefined) tracks.push(t); else tracks.splice(index, 0, t);
  return withDuration({ ...comp, tracks });
}

export function updateTrack(comp: Composition, trackId: string, patch: Partial<Omit<Track, 'clips' | 'id'>>): Composition {
  return { ...comp, tracks: comp.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) };
}

export function removeTrack(comp: Composition, trackId: string): Composition {
  return withDuration({ ...comp, tracks: comp.tracks.filter((t) => t.id !== trackId) });
}

export function moveTrack(comp: Composition, trackId: string, dir: -1 | 1): Composition {
  const i = comp.tracks.findIndex((t) => t.id === trackId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= comp.tracks.length) return comp;
  const tracks = [...comp.tracks];
  [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  return { ...comp, tracks };
}

/** Undo/redo stack of immutable snapshots. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(public present: T, private limit = 200) {}
  push(next: T): T {
    if (next === this.present) return next;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
    return next;
  }
  /** Replace the present without creating an undo step (used to coalesce rapid edits). */
  replace(next: T): T {
    this.present = next;
    this.future = [];
    return next;
  }
  undo(): T {
    const prev = this.past.pop();
    if (prev === undefined) return this.present;
    this.future.push(this.present);
    this.present = prev;
    return prev;
  }
  redo(): T {
    const next = this.future.pop();
    if (next === undefined) return this.present;
    this.past.push(this.present);
    this.present = next;
    return next;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  reset(value: T) { this.past = []; this.future = []; this.present = value; }
}
