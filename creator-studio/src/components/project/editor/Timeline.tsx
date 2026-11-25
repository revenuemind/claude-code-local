'use client';
/** Multi-track timeline: ruler, playhead, drag-to-move (with snapping and track changes), edge trimming. */
import { memo, useMemo, useRef, type PointerEvent as RPE } from 'react';
import type { Clip, Composition, Track } from '@/lib/composition/types';
import { moveClip, trimClip, updateTrack } from '@/lib/composition/ops';
import { cx } from '../../ui';
import { useI18n } from '../../I18nProvider';
import { displayName } from '@/lib/i18n/names';
import type { Locale as UiLocale } from '@/lib/i18n/config';

const HEADER_W = 168;
const LANE_H = 34;
export const timelineHeight = (tracks: number) => 28 + tracks * LANE_H + 14;

const COLORS: Record<string, string> = {
  background: 'from-[#2a2350] to-[#1d1a38] border-[#4b3f8f]', image: 'from-[#1f3b55] to-[#16293c] border-[#2f6a96]', video: 'from-[#173f3f] to-[#112c2c] border-[#2a7a76]',
  text: 'from-[#4a2f57] to-[#33213d] border-[#8a55a3]', shape: 'from-[#3d3524] to-[#2a2419] border-[#8b7342]', caption: 'from-[#52331f] to-[#382315] border-[#a86a3c]',
  audio: 'from-[#203a28] to-[#16291c] border-[#3c8a55]',
};

function clipLabel(c: Clip, locale: UiLocale): string {
  if (c.type === 'text') return c.text.replace(/\*/g, '');
  if (c.type === 'caption') return c.words.map((w) => w.text).join(' ');
  if (c.type === 'audio') return displayName(c.name, locale) ?? c.role;
  return displayName(c.name, locale) ?? c.type;
}

interface Props {
  comp: Composition; time: number; pxPerSec: number; selectedId: string | null; snap: boolean;
  onSelect: (id: string | null) => void; onSeek: (t: number) => void; onChange: (c: Composition, commit: boolean) => void;
}

export const Timeline = memo(function Timeline({ comp, time, pxPerSec, selectedId, snap, onSelect, onSeek, onChange }: Props) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const width = Math.max(800, (comp.durationMs / 1000 + 5) * pxPerSec);
  const ms2px = (ms: number) => (ms / 1000) * pxPerSec;
  const px2ms = (px: number) => (px / pxPerSec) * 1000;

  const edges = useMemo(() => {
    const e: number[] = [0];
    for (const tr of comp.tracks) for (const c of tr.clips) e.push(c.start, c.start + c.duration);
    return e;
  }, [comp]);

  const snapMs = (ms: number, exclude: string, extra: number[] = []) => {
    if (!snap) return ms;
    const tol = px2ms(8);
    let best = ms; let bestD = tol;
    for (const e of [...edges, ...extra, time]) { const d = Math.abs(e - ms); if (d < bestD) { best = e; bestD = d; } }
    void exclude;
    return best;
  };

  const drag = useRef<{ mode: 'move' | 'start' | 'end'; id: string; x: number; y: number; base: Composition; clip: Clip; trackIndex: number } | null>(null);

  const begin = (e: RPE, c: Clip, trackIndex: number, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    onSelect(c.id);
    if (comp.tracks[trackIndex].locked || c.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id: c.id, x: e.clientX, y: e.clientY, base: comp, clip: c, trackIndex };
  };
  const move = (e: RPE, commit = false) => {
    const d = drag.current;
    if (!d) return;
    const dms = px2ms(e.clientX - d.x);
    let next: Composition;
    if (d.mode === 'move') {
      let start = Math.max(0, d.clip.start + dms);
      const snappedStart = snapMs(start, d.id);
      const snappedEnd = snapMs(start + d.clip.duration, d.id);
      start = snappedStart !== start ? snappedStart : snappedEnd !== start + d.clip.duration ? snappedEnd - d.clip.duration : start;
      const laneDelta = Math.round((e.clientY - d.y) / LANE_H);
      const target = d.base.tracks[d.trackIndex + laneDelta];
      const toTrack = target && target.kind === d.base.tracks[d.trackIndex].kind && !target.locked ? target.id : undefined;
      next = moveClip(d.base, d.id, start, toTrack);
    } else if (d.mode === 'start') {
      next = trimClip(d.base, d.id, 'start', snapMs(d.clip.start + dms, d.id));
    } else {
      next = trimClip(d.base, d.id, 'end', snapMs(d.clip.start + d.clip.duration + dms, d.id));
    }
    onChange(next, commit);
    if (commit) drag.current = null;
  };

  const seekFromEvent = (e: RPE<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, px2ms(e.clientX - r.left)));
  };

  const ticks = useMemo(() => {
    const step = pxPerSec >= 120 ? 1 : pxPerSec >= 50 ? 2 : pxPerSec >= 25 ? 5 : 10;
    const out: number[] = [];
    for (let s = 0; s <= comp.durationMs / 1000 + 5; s += step) out.push(s);
    return out;
  }, [pxPerSec, comp.durationMs]);

  const toggle = (tr: Track, key: 'hidden' | 'muted' | 'locked') => onChange(updateTrack(comp, tr.id, { [key]: !tr[key] }), true);

  return (
    <div dir="ltr" className="scroll-thin flex h-full min-h-0 select-none overflow-y-auto border-t border-line bg-panel text-xs" data-testid="timeline">
      <div className="sticky left-0 z-30 h-max shrink-0 border-e border-line bg-panel" style={{ width: HEADER_W }}>
        <div className="h-7 border-b border-line" />
        {comp.tracks.map((tr) => (
          <div key={tr.id} className="flex items-center gap-1 border-b border-line/60 px-2" style={{ height: LANE_H }}>
            <span className="min-w-0 flex-1 truncate font-medium text-ink-2">{displayName(tr.name, locale)}</span>
            {tr.kind === 'visual'
              ? <button className={cx('btn btn-sm btn-icon !px-1.5', tr.hidden && 'text-bad')} onClick={() => toggle(tr, 'hidden')} title={tr.hidden ? t('editor.show') : t('editor.hide')}>{tr.hidden ? '◌' : '◉'}</button>
              : <button className={cx('btn btn-sm btn-icon !px-1.5', tr.muted && 'text-bad')} onClick={() => toggle(tr, 'muted')} title={tr.muted ? t('editor.unmute') : t('editor.mute')}>{tr.muted ? '🔇' : '🔊'}</button>}
            <button className={cx('btn btn-sm btn-icon !px-1.5', tr.locked && 'text-warn')} onClick={() => toggle(tr, 'locked')} title={tr.locked ? t('editor.unlock') : t('editor.lock')}>{tr.locked ? '🔒' : '🔓'}</button>
          </div>
        ))}
      </div>
      <div ref={scroller} className="scroll-thin relative h-max min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width }}>
          <div className="sticky top-0 z-20 h-7 cursor-pointer border-b border-line bg-panel-2" onPointerDown={(e) => { seekFromEvent(e); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (e.buttons) seekFromEvent(e); }}>
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full border-s border-line-2 ps-1 font-mono text-[10px] leading-7 text-mute" style={{ left: ms2px(s * 1000) }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</div>
            ))}
          </div>
          {comp.tracks.map((tr, ti) => (
            <div key={tr.id} className={cx('relative border-b border-line/60', tr.hidden || tr.muted ? 'opacity-40' : '')} style={{ height: LANE_H }} onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); seekFromEvent(e); } }}>
              {tr.clips.map((c) => (
                <div key={c.id}
                  className={cx('absolute top-1 bottom-1 overflow-hidden rounded-md border bg-gradient-to-b', COLORS[c.type] ?? COLORS.background, selectedId === c.id ? 'ring-2 ring-accent' : '', tr.locked ? 'cursor-not-allowed' : 'cursor-grab')}
                  style={{ left: ms2px(c.start), width: Math.max(4, ms2px(c.duration)) }}
                  onPointerDown={(e) => begin(e, c, ti, 'move')} onPointerMove={(e) => move(e)} onPointerUp={(e) => move(e, true)}
                  data-testid={`clip-${c.type}`} title={clipLabel(c, locale)}>
                  <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/30" onPointerDown={(e) => begin(e, c, ti, 'start')} onPointerMove={(e) => move(e)} onPointerUp={(e) => move(e, true)} />
                  <div className="pointer-events-none truncate px-2 pt-1 text-[11px] font-medium text-ink" dir="auto" style={{ textAlign: 'left' }}>{clipLabel(c, locale)}</div>
                  {c.transition && c.transition.type !== 'cut' && <div className="pointer-events-none absolute inset-y-0 left-0 bg-white/10" style={{ width: ms2px(c.transition.durationMs) }} />}
                  <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/30" onPointerDown={(e) => begin(e, c, ti, 'end')} onPointerMove={(e) => move(e)} onPointerUp={(e) => move(e, true)} />
                </div>
              ))}
            </div>
          ))}
          <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-accent-2" style={{ left: ms2px(time) }}>
            <div className="absolute -top-0 -left-1.5 h-3 w-3 rotate-45 bg-accent-2" />
          </div>
        </div>
      </div>
    </div>
  );
});
