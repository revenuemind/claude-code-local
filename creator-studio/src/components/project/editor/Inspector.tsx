'use client';
/** Property inspector for the selected clip (text, media, shapes, captions, backgrounds, audio). */
import type { Animation, BackgroundKind, CaptionClip, Clip, EnterExitType, TextStyle, TransitionType } from '@/lib/composition/types';
import { FONT_FAMILIES } from '@/lib/render/fonts';
import { estimateWordTimings } from '@/lib/templates/engine';
import { useI18n } from '../../I18nProvider';
import { Field } from '../../ui';

const ANIMS: EnterExitType[] = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'zoom-in', 'zoom-out', 'wipe', 'blur', 'typewriter', 'words', 'rise-words'];
const TRANSITIONS: TransitionType[] = ['cut', 'crossfade', 'fade-black', 'fade-white', 'wipe-left', 'wipe-right', 'wipe-up', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'circle', 'flash'];
const BG_KINDS: BackgroundKind[] = ['solid', 'linear', 'radial', 'aurora', 'mesh', 'particles', 'grid', 'waves', 'bokeh', 'stripes', 'spotlight', 'rays', 'dots'];

const sec = (ms: number) => Math.round(ms / 10) / 100;
const toHex = (c: string | undefined, fallback = '#ffffff') => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : c && /^#[0-9a-f]{3}$/i.test(c) ? `#${c.slice(1).split('').map((x) => x + x).join('')}` : fallback);

function Num({ label, value, onChange, step = 0.1, min, max }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  return <Field label={label}><input type="number" className="field !py-1" value={Number.isFinite(value) ? value : 0} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function AnimSelect({ label, value, onChange }: { label: string; value?: Animation; onChange: (a: Animation | undefined) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <select className="field !py-1" value={value?.type ?? 'none'} onChange={(e) => onChange(e.target.value === 'none' ? undefined : { type: e.target.value as EnterExitType, durationMs: value?.durationMs ?? 500, delayMs: value?.delayMs })}>
          {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {value && <input type="number" className="field !w-20 !py-1" step={0.1} value={sec(value.durationMs)} onChange={(e) => onChange({ ...value, durationMs: Math.max(0, Number(e.target.value) * 1000) })} aria-label="seconds" />}
      </div>
    </Field>
  );
}

export function Inspector({ clip, onChange, onPickMedia }: { clip: Clip | null; onChange: (patch: Partial<Clip>, key: string) => void; onPickMedia: () => void }) {
  const { t } = useI18n();
  if (!clip) return <p className="p-4 text-sm text-mute">{t('editor.noSelection')}</p>;
  const set = (patch: Partial<Clip>, key = Object.keys(patch)[0]) => onChange(patch, `${clip.id}:${key}`);
  const style = 'style' in clip && clip.style && 'fontFamily' in clip.style ? (clip.style as TextStyle) : null;
  const setStyle = (p: Partial<TextStyle>) => set({ style: { ...style!, ...p } } as Partial<Clip>, `style.${Object.keys(p)[0]}`);
  const box = 'box' in clip ? clip.box : null;

  return (
    <div className="space-y-4 p-4 text-sm" data-testid="inspector">
      <div className="flex items-center justify-between">
        <span className="badge badge-accent">{clip.type}</span>
        <span className="truncate text-xs text-mute">{clip.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num label={`${t('editor.start')} (s)`} value={sec(clip.start)} onChange={(v) => set({ start: Math.max(0, v * 1000) })} min={0} />
        <Num label={`${t('editor.duration')} (s)`} value={sec(clip.duration)} onChange={(v) => set({ duration: Math.max(100, v * 1000) })} min={0.1} />
      </div>

      {clip.type === 'text' && (<>
        <Field label={t('editor.text')}><textarea dir="auto" className="field h-24" value={clip.text} onChange={(e) => set({ text: e.target.value } as Partial<Clip>)} data-testid="inspector-text" /></Field>
        <p className="-mt-2 text-[11px] text-mute">*word* → highlight</p>
      </>)}

      {clip.type === 'caption' && (<>
        <Field label={t('editor.captionStyle')}>
          <select className="field !py-1" value={clip.preset} onChange={(e) => set({ preset: e.target.value as CaptionClip['preset'] } as Partial<Clip>)}>
            {['bold-pop', 'karaoke', 'minimal', 'boxed', 'neon'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Num label={t('editor.wordsPerLine')} value={clip.wordsPerLine ?? 3} step={1} min={1} max={12} onChange={(v) => set({ wordsPerLine: Math.round(v) } as Partial<Clip>)} />
        <Field label={t('editor.captionText')}>
          <textarea dir="auto" className="field h-24" defaultValue={clip.words.map((w) => w.text).join(' ')} onBlur={(e) => {
            const span = clip.words.length ? clip.words[clip.words.length - 1].end - clip.words[0].start : clip.duration - 300;
            set({ words: estimateWordTimings(e.target.value, Math.max(300, span), clip.words[0]?.start ?? 150) } as Partial<Clip>, 'words');
          }} />
        </Field>
        <p className="-mt-2 text-[11px] text-mute">{t('editor.regenerateTiming')}</p>
      </>)}

      {style && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('editor.font')}><select className="field !py-1" value={style.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })}>{FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}</select></Field>
            <Field label={t('editor.weight')}><select className="field !py-1" value={style.fontWeight} onChange={(e) => setStyle({ fontWeight: Number(e.target.value) })}>{[400, 500, 600, 700, 800, 900].map((w) => <option key={w}>{w}</option>)}</select></Field>
            <Num label={t('editor.size')} value={style.fontSize} step={2} min={8} onChange={(v) => setStyle({ fontSize: v })} />
            <Field label={t('editor.align')}><select className="field !py-1" value={style.align ?? 'center'} onChange={(e) => setStyle({ align: e.target.value as TextStyle['align'] })}>{['start', 'center', 'end'].map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label={t('editor.color')}><input type="color" className="h-9 w-full rounded-lg bg-transparent" value={toHex(style.color)} onChange={(e) => setStyle({ color: e.target.value })} /></Field>
            <Field label={t('editor.highlight')}><input type="color" className="h-9 w-full rounded-lg bg-transparent" value={toHex(style.highlightColor, '#facc15')} onChange={(e) => setStyle({ highlightColor: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!style.uppercase} onChange={(e) => setStyle({ uppercase: e.target.checked })} />{t('editor.uppercase')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!style.stroke} onChange={(e) => setStyle({ stroke: e.target.checked ? { color: 'rgba(0,0,0,0.85)', width: 8 } : undefined })} />{t('editor.stroke')}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!style.background} onChange={(e) => setStyle({ background: e.target.checked ? { color: 'rgba(0,0,0,0.6)', padding: 24, radius: 16 } : undefined })} />{t('editor.background')}</label>
          </div>
        </div>
      )}

      {(clip.type === 'image' || clip.type === 'video') && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <button className="btn btn-soft btn-sm w-full" onClick={onPickMedia}>{t('editor.replaceMedia')}</button>
          <Field label={t('editor.fit')}><select className="field !py-1" value={clip.fit} onChange={(e) => set({ fit: e.target.value as 'cover' | 'contain' } as Partial<Clip>)}><option>cover</option><option>contain</option></select></Field>
          {clip.type === 'image' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!clip.kenBurns} onChange={(e) => set({ kenBurns: e.target.checked ? { from: { at: 0, scale: 1, x: 0, y: 0 }, to: { at: 1, scale: 1.15, x: 0.02, y: -0.01 } } : undefined } as Partial<Clip>)} />Ken Burns</label>}
          {clip.type === 'video' && (
            <div className="grid grid-cols-2 gap-2">
              <Num label={t('editor.speed')} value={clip.speed} step={0.25} min={0.25} max={4} onChange={(v) => set({ speed: v } as Partial<Clip>)} />
              <Num label={t('editor.volume')} value={clip.volume} step={0.1} min={0} max={2} onChange={(v) => set({ volume: v, muted: v === 0 } as Partial<Clip>)} />
              <Num label={`${t('editor.trimIn')} (s)`} value={sec(clip.trimIn)} min={0} onChange={(v) => set({ trimIn: Math.max(0, v * 1000) } as Partial<Clip>)} />
            </div>
          )}
          <Num label="Overlay" value={clip.overlay?.opacity ?? 0} step={0.05} min={0} max={1} onChange={(v) => set({ overlay: v > 0 ? { color: '#000000', opacity: v } : undefined } as Partial<Clip>)} />
        </div>
      )}

      {clip.type === 'background' && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <Field label={t('editor.kind')}><select className="field !py-1" value={clip.style.kind} onChange={(e) => set({ style: { ...clip.style, kind: e.target.value as BackgroundKind } } as Partial<Clip>)}>{BG_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <span className="label">{t('editor.colors')}</span>
          <div className="flex gap-2">
            {clip.style.colors.slice(0, 4).map((c, i) => <input key={i} type="color" className="h-9 w-full rounded-lg bg-transparent" value={toHex(c)} onChange={(e) => { const colors = [...clip.style.colors]; colors[i] = e.target.value; set({ style: { ...clip.style, colors } } as Partial<Clip>, `bg${i}`); }} />)}
          </div>
        </div>
      )}

      {clip.type === 'shape' && (
        <Field label={t('editor.color')}><input type="color" className="h-9 w-full rounded-lg bg-transparent" value={toHex(clip.fill ?? clip.stroke?.color)} onChange={(e) => set(clip.stroke && !clip.fill ? ({ stroke: { ...clip.stroke, color: e.target.value } } as Partial<Clip>) : ({ fill: e.target.value } as Partial<Clip>))} /></Field>
      )}

      {clip.type === 'audio' && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3">
          <Num label={t('editor.volume')} value={clip.volume} step={0.05} min={0} max={2} onChange={(v) => set({ volume: v } as Partial<Clip>)} />
          <Num label={`${t('editor.trimIn')} (s)`} value={sec(clip.trimIn)} min={0} onChange={(v) => set({ trimIn: Math.max(0, v * 1000) } as Partial<Clip>)} />
          <Num label={`${t('editor.fadeIn')} (s)`} value={sec(clip.fadeInMs ?? 0)} min={0} onChange={(v) => set({ fadeInMs: v * 1000 } as Partial<Clip>)} />
          <Num label={`${t('editor.fadeOut')} (s)`} value={sec(clip.fadeOutMs ?? 0)} min={0} onChange={(v) => set({ fadeOutMs: v * 1000 } as Partial<Clip>)} />
          {clip.procedural && (
            <Field label="Mood"><select className="field !py-1" value={clip.procedural.mood} onChange={(e) => set({ procedural: { ...clip.procedural!, mood: e.target.value as never } } as Partial<Clip>)}>
              {['uplifting', 'calm', 'dramatic', 'energetic', 'luxury', 'dark', 'playful', 'inspiring', 'corporate', 'cinematic'].map((m) => <option key={m}>{m}</option>)}
            </select></Field>
          )}
          {clip.procedural && <Num label="BPM" value={clip.procedural.bpm} step={1} min={40} max={220} onChange={(v) => set({ procedural: { ...clip.procedural!, bpm: v } } as Partial<Clip>)} />}
        </div>
      )}

      {clip.type !== 'audio' && (<>
        <Num label={t('editor.opacity')} value={clip.opacity ?? 1} step={0.05} min={0} max={1} onChange={(v) => set({ opacity: v })} />
        <div className="grid grid-cols-1 gap-2">
          <AnimSelect label={t('editor.enter')} value={clip.enter} onChange={(a) => set({ enter: a })} />
          <AnimSelect label={t('editor.exit')} value={clip.exit} onChange={(a) => set({ exit: a })} />
          <Field label={t('editor.transition')}>
            <div className="flex gap-1">
              <select className="field !py-1" value={clip.transition?.type ?? 'cut'} onChange={(e) => set({ transition: e.target.value === 'cut' ? undefined : { type: e.target.value as TransitionType, durationMs: clip.transition?.durationMs ?? 500 } })}>
                {TRANSITIONS.map((x) => <option key={x}>{x}</option>)}
              </select>
              {clip.transition && <input type="number" className="field !w-20 !py-1" step={0.1} value={sec(clip.transition.durationMs)} onChange={(e) => set({ transition: { ...clip.transition!, durationMs: Math.max(0, Number(e.target.value) * 1000) } })} aria-label="seconds" />}
            </div>
          </Field>
        </div>
      </>)}

      {box && (
        <div>
          <span className="label">{t('editor.position')} (%)</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <input key={k} type="number" className="field !px-1.5 !py-1 text-xs" step={1} value={Math.round(box[k] * 1000) / 10} aria-label={k}
                onChange={(e) => set({ box: { ...box, [k]: Number(e.target.value) / 100 } } as Partial<Clip>, `box.${k}`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
