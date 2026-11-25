'use client';
/**
 * Live preview player. Draws frames with the same renderer the export worker
 * uses, so what you see here is what gets exported.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Composition, VisualClip } from '@/lib/composition/types';
import { renderFrame, hitTest } from '@/lib/render/renderer';
import { clearTextLayoutCache } from '@/lib/render/text';

let fontListener = false;
function watchFonts() {
  if (fontListener || typeof document === 'undefined') return;
  fontListener = true;
  document.fonts.addEventListener('loadingdone', () => clearTextLayoutCache());
}
import { BrowserMedia } from '@/lib/client/media';
import { AudioPreview } from '@/lib/client/audio';

/** Load every font family a composition uses before drawing (avoids fallback-font flashes). */
export function useCompositionFonts(comp: Composition | null, onLoaded: () => void) {
  useEffect(() => {
    if (!comp || typeof document === 'undefined') return;
    const specs = new Set<string>();
    for (const t of comp.tracks) for (const c of t.clips) if ('style' in c && c.style && 'fontFamily' in c.style) specs.add(`${c.style.fontWeight} 32px "${c.style.fontFamily}"`);
    ['Rubik', 'Heebo', 'Cairo', 'Noto Sans Ethiopic', 'Inter'].forEach((f) => { specs.add(`400 32px "${f}"`); specs.add(`800 32px "${f}"`); });
    let alive = true;
    watchFonts();
    Promise.all([...specs].map((s) => document.fonts.load(s).catch(() => []))).then(() => { clearTextLayoutCache(); if (alive) onLoaded(); });
    return () => { alive = false; };
  }, [comp, onLoaded]);
}

export interface Playback { time: number; playing: boolean; setTime: (t: number) => void; play: () => void; pause: () => void; toggle: () => void }

export function usePlayback(comp: Composition | null, opts: { loop?: boolean; audio?: boolean; initialTime?: number } = {}): Playback {
  const [time, setTimeState] = useState(opts.initialTime ?? 0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(time);
  const audio = useMemo(() => (opts.audio && typeof window !== 'undefined' ? new AudioPreview() : null), [opts.audio]);
  const compRef = useRef(comp);
  compRef.current = comp;
  const duration = comp?.durationMs ?? 0;

  const setTime = useCallback((t: number) => {
    const v = Math.max(0, Math.min(duration, t));
    timeRef.current = v;
    setTimeState(v);
  }, [duration]);

  useEffect(() => () => audio?.dispose(), [audio]);
  useEffect(() => { if (comp && audio) void audio.prepare(comp); }, [comp, audio]);

  useEffect(() => {
    if (!playing || !comp) return;
    let raf = 0;
    let start = performance.now() - timeRef.current;
    if (audio) void audio.start(comp, timeRef.current);
    const tick = (now: number) => {
      let t = now - start;
      if (t >= duration) {
        if (opts.loop) { start = now; t = 0; if (audio && compRef.current) void audio.start(compRef.current, 0); }
        else { timeRef.current = duration; setTimeState(duration); setPlaying(false); return; }
      }
      timeRef.current = t;
      setTimeState(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); audio?.stop(); };
    // restart the loop when the composition changes while playing
  }, [playing, comp, duration, opts.loop, audio]);

  return {
    time, playing, setTime,
    play: () => { if (timeRef.current >= duration - 10) setTime(0); setPlaying(true); },
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => { if (!p && timeRef.current >= duration - 10) { timeRef.current = 0; setTimeState(0); } return !p; }),
  };
}

export interface PlayerProps {
  comp: Composition;
  time: number;
  playing?: boolean;
  className?: string;
  placeholders?: boolean;
  safeArea?: boolean;
  selectedClipId?: string | null;
  onSelect?: (clip: VisualClip | null) => void;
  onDragClip?: (clipId: string, dx: number, dy: number, phase: 'move' | 'end') => void;
  maxHeight?: number | string;
  rounded?: boolean;
}

export function Player({ comp, time, playing = false, className, placeholders, safeArea, selectedClipId, onSelect, onDragClip, maxHeight, rounded = true }: PlayerProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((n) => n + 1), []);
  const media = useMemo(() => (typeof window !== 'undefined' ? new BrowserMedia(redraw) : null), [redraw]);
  useEffect(() => () => media?.dispose(), [media]);
  useCompositionFonts(comp, redraw);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const ar = comp.width / comp.height;
      const maxH = typeof maxHeight === 'number' ? maxHeight : r.height || Infinity;
      let w = r.width; let h = w / ar;
      if (h > maxH && Number.isFinite(maxH)) { h = maxH; w = h * ar; }
      setSize({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [comp.width, comp.height, maxHeight]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !media) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(size.w * dpr); const ph = Math.round(size.h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    media.playing = playing;
    media.beginFrame();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderFrame(ctx, comp, time, size.w, size.h, { media, placeholders, selectedClipId, safeArea });
    media.endFrame();
  }, [comp, time, size, playing, placeholders, selectedClipId, safeArea, tick, media]);

  useEffect(() => { if (!playing) media?.pauseAll(); }, [playing, media]);

  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const onPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!onSelect) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(comp, time, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    onSelect(hit);
    if (hit && onDragClip && !hit.locked) { drag.current = { id: hit.id, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }
  };
  const onPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !onDragClip) return;
    const r = e.currentTarget.getBoundingClientRect();
    onDragClip(drag.current.id, (e.clientX - drag.current.x) / r.width, (e.clientY - drag.current.y) / r.height, 'move');
  };
  const onPointerUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !onDragClip) return;
    const r = e.currentTarget.getBoundingClientRect();
    onDragClip(drag.current.id, (e.clientX - drag.current.x) / r.width, (e.clientY - drag.current.y) / r.height, 'end');
    drag.current = null;
  };

  return (
    <div ref={wrap} className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: 0 }}>
      <canvas
        ref={canvas}
        dir="ltr"
        style={{ width: size.w, height: size.h, borderRadius: rounded ? 14 : 0, boxShadow: '0 20px 60px -30px rgba(0,0,0,.9)', cursor: onSelect ? 'crosshair' : 'default', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Video preview"
        role="img"
      />
    </div>
  );
}

export function TransportBar({ pb, duration, compact }: { pb: Playback; duration: number; compact?: boolean }) {
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  return (
    <div dir="ltr" className="flex items-center gap-3">
      <button className="btn btn-soft btn-sm" onClick={pb.toggle} aria-label={pb.playing ? 'Pause' : 'Play'}>{pb.playing ? '❚❚' : '▶'}</button>
      <input type="range" min={0} max={Math.max(1, duration)} value={pb.time} onChange={(e) => pb.setTime(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" aria-label="Seek" />
      {!compact && <span className="w-24 shrink-0 text-end font-mono text-xs text-mute">{fmt(pb.time)} / {fmt(duration)}</span>}
    </div>
  );
}
