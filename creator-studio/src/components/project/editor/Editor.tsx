'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioClip, Clip, Composition, ImageClip, ShapeClip, TextClip, VideoClip } from '@/lib/composition/types';
import { History, addClip, duplicateClip, findClip, removeClip, splitClip, uid, updateClip, withDuration } from '@/lib/composition/ops';
import type { ClientAsset, ClientProject } from '@/lib/client/types';
import { apiFetch, ApiError, assetUrl } from '@/lib/client/api';
import { useI18n } from '../../I18nProvider';
import { Player, usePlayback } from '../../Player';
import { Modal, Spinner, cx, useAction, useToast } from '../../ui';
import { useProject } from '../ProjectWorkspace';
import { Timeline, timelineHeight } from './Timeline';
import { Inspector } from './Inspector';

export function Editor() {
  const { t, date } = useI18n();
  const { project, setProject, reload, perms } = useProject();
  const toast = useToast();
  const { busy, run } = useAction();
  const history = useRef(new History<Composition>(project.composition!));
  const [comp, setComp] = useState<Composition>(project.composition!);
  const [revision, setRevision] = useState(project.compositionRevision);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [snap, setSnap] = useState(true);
  const [safeArea, setSafeArea] = useState(false);
  const [picker, setPicker] = useState<null | 'add' | 'replace'>(null);
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; version: number; label: string | null; createdAt: string }>>([]);
  const [, force] = useState(0);
  const pb = usePlayback(comp, { audio: true });
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const dragBase = useRef<Composition | null>(null);

  // Adopt server changes (e.g. generated media arrived) when there are no local edits.
  useEffect(() => {
    if (!dirty && project.composition && project.compositionRevision !== revision) {
      history.current.reset(project.composition); setComp(project.composition); setRevision(project.compositionRevision);
    }
  }, [project.composition, project.compositionRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((next: Composition, coalesceKey?: string) => {
    const now = Date.now();
    const n = withDuration(next);
    if (coalesceKey && lastKey.current?.key === coalesceKey && now - lastKey.current.at < 1200) history.current.replace(n);
    else history.current.push(n);
    lastKey.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    setComp(n); setDirty(true); force((x) => x + 1);
  }, []);

  const selected = useMemo(() => (selectedId ? findClip(comp, selectedId)?.clip ?? null : null), [comp, selectedId]);
  const trackByRole = (role: string) => comp.tracks.find((tr) => tr.role === role);

  const undo = () => { const c = history.current.undo(); setComp(c); setDirty(true); force((x) => x + 1); };
  const redo = () => { const c = history.current.redo(); setComp(c); setDirty(true); force((x) => x + 1); };
  const split = () => { if (!selectedId) return; const r = splitClip(comp, selectedId, pb.time); if (r.rightId) { apply(r.comp); setSelectedId(r.rightId); } };
  const del = () => { if (!selectedId) return; apply(removeClip(comp, selectedId)); setSelectedId(null); };
  const dup = () => { if (!selectedId) return; const r = duplicateClip(comp, selectedId); apply(r.comp); setSelectedId(r.newId); };

  const addText = () => {
    const tr = trackByRole('text') ?? comp.tracks.find((x) => x.kind === 'visual')!;
    const c: TextClip = {
      id: uid('tx'), type: 'text', name: 'Text', text: 'New *text*', start: Math.round(pb.time), duration: 3000, box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
      style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 96, color: '#ffffff', highlightColor: '#facc15', align: 'center', valign: 'middle', autoFit: true, shadow: { color: 'rgba(0,0,0,0.5)', blur: 16, y: 4 } },
      enter: { type: 'pop', durationMs: 450 }, exit: { type: 'fade', durationMs: 250 },
    };
    apply(addClip(comp, tr.id, c)); setSelectedId(c.id); pb.setTime(c.start + 700);
  };
  const addShape = () => {
    const tr = trackByRole('overlay') ?? comp.tracks.find((x) => x.kind === 'visual')!;
    const c: ShapeClip = { id: uid('sh'), type: 'shape', name: 'Shape', shape: 'pill', start: Math.round(pb.time), duration: 3000, box: { x: 0.25, y: 0.72, w: 0.5, h: 0.07 }, fill: '#8b6cff', enter: { type: 'pop', durationMs: 400 } };
    apply(addClip(comp, tr.id, c)); setSelectedId(c.id); pb.setTime(c.start + 600);
  };
  const openPicker = async (mode: 'add' | 'replace') => {
    setPicker(mode);
    setAssets((await apiFetch<{ assets: ClientAsset[] }>('/api/assets')).assets.filter((a) => ['image', 'video', 'audio'].includes(a.kind)));
  };
  const pickAsset = (a: ClientAsset) => {
    if (picker === 'replace' && selected && (selected.type === 'image' || selected.type === 'video')) {
      if (a.kind !== selected.type) { toast('error', `${t('editor.replaceMedia')}: ${selected.type}`); return; }
      apply(updateClip(comp, selected.id, { media: { assetId: a.id }, ...(a.kind === 'video' ? { sourceDurationMs: a.durationMs ?? undefined } : {}) } as Partial<Clip>));
    } else if (a.kind === 'audio') {
      const tr = trackByRole('sfx') ?? trackByRole('music') ?? comp.tracks.find((x) => x.kind === 'audio')!;
      const c: AudioClip = { id: uid('au'), type: 'audio', role: 'sfx', name: a.name, media: { assetId: a.id }, start: Math.round(pb.time), duration: a.durationMs ?? 3000, trimIn: 0, volume: 1 };
      apply(addClip(comp, tr.id, c)); setSelectedId(c.id);
    } else {
      const tr = trackByRole('overlay') ?? comp.tracks.find((x) => x.kind === 'visual')!;
      const base = { id: uid('md'), name: a.name, media: { assetId: a.id }, start: Math.round(pb.time), duration: Math.min(a.durationMs ?? 4000, 15000), box: { x: 0.1, y: 0.25, w: 0.8, h: 0.45 }, fit: 'cover' as const, radius: 24, enter: { type: 'zoom-in' as const, durationMs: 500 } };
      const c: Clip = a.kind === 'video' ? ({ ...base, type: 'video', trimIn: 0, speed: 1, volume: 1, sourceDurationMs: a.durationMs ?? undefined } as VideoClip) : ({ ...base, type: 'image' } as ImageClip);
      apply(addClip(comp, tr.id, c)); setSelectedId(c.id);
    }
    setPicker(null);
  };

  const save = useCallback(() => run('save', async () => {
    try {
      const r = await apiFetch<{ revision: number }>(`/api/projects/${project.id}/composition`, { method: 'PUT', body: { composition: comp, revision } });
      setRevision(r.revision); setDirty(false);
      setProject({ ...project, composition: comp, compositionRevision: r.revision });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setConflict(true); return; }
      throw e;
    }
  }, t('common.saved')), [run, project, comp, revision, setProject, t]);

  const saveVersion = () => run('ver', async () => {
    const label = prompt(t('editor.saveVersion'), `v${new Date().toLocaleString()}`);
    if (label === null) return;
    if (dirty) await save();
    await apiFetch(`/api/projects/${project.id}/versions`, { body: { label } });
  }, t('common.saved'));
  const openVersions = () => run('vers', async () => { setVersions((await apiFetch<{ versions: typeof versions }>(`/api/projects/${project.id}/versions`)).versions); setVersionsOpen(true); });
  const restore = (vid: string) => run('restore', async () => {
    const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/versions/${vid}/restore`, { body: {} });
    setProject(r.project); history.current.reset(r.project.composition!); setComp(r.project.composition!); setRevision(r.project.compositionRevision); setDirty(false); setVersionsOpen(false);
  });
  const rebuild = () => run('rebuild', async () => {
    if (!confirm(t('plan.approveHint'))) return;
    const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/composition/rebuild`, { body: {} });
    setProject(r.project); history.current.reset(r.project.composition!); setComp(r.project.composition!); setRevision(r.project.compositionRevision); setDirty(false);
  });
  const reloadLatest = async () => { await reload(); setConflict(false); setDirty(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') { e.preventDefault(); pb.toggle(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) { e.preventDefault(); del(); } }
      else if (e.key.toLowerCase() === 's' && !mod) split();
      else if (e.key === 'ArrowLeft') pb.setTime(pb.time - (e.shiftKey ? 1000 : 1000 / comp.fps));
      else if (e.key === 'ArrowRight') pb.setTime(pb.time + (e.shiftKey ? 1000 : 1000 / comp.fps));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onDragClip = (id: string, dx: number, dy: number, phase: 'move' | 'end') => {
    if (!dragBase.current) dragBase.current = comp;
    const base = findClip(dragBase.current, id)?.clip;
    if (!base) return;
    const tf = base.transform ?? {};
    const next = updateClip(dragBase.current, id, { transform: { ...tf, x: (tf.x ?? 0) + dx, y: (tf.y ?? 0) + dy } });
    if (phase === 'move') setComp(next);
    else { dragBase.current = null; apply(next); }
  };

  const fmt = (ms: number) => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; };
  const ro = !perms.write;

  return (
    <div className="flex h-[calc(100vh-52px)] min-h-[640px] flex-col lg:h-[calc(100vh-52px)]" data-testid="editor">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel px-3 py-2">
        <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!history.current.canUndo} title={t('editor.undo')}>↶</button>
        <button className="btn btn-ghost btn-sm" onClick={redo} disabled={!history.current.canRedo} title={t('editor.redo')}>↷</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button className="btn btn-ghost btn-sm" onClick={split} disabled={!selectedId || ro} title={t('editor.split')}>✂ {t('editor.split')}</button>
        <button className="btn btn-ghost btn-sm" onClick={dup} disabled={!selectedId || ro}>⧉</button>
        <button className="btn btn-ghost btn-sm" onClick={del} disabled={!selectedId || ro} title={t('editor.remove')}>🗑</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button className="btn btn-soft btn-sm" onClick={addText} disabled={ro} data-testid="add-text">＋ {t('editor.addText')}</button>
        <button className="btn btn-soft btn-sm" onClick={addShape} disabled={ro}>＋ {t('editor.addShape')}</button>
        <button className="btn btn-soft btn-sm" onClick={() => openPicker('add')} disabled={ro}>＋ {t('editor.addMedia')}</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button className="btn btn-ghost btn-sm" onClick={() => setPxPerSec((p) => Math.max(8, p / 1.5))} title={t('editor.zoomOut')}>−</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setPxPerSec((p) => Math.min(400, p * 1.5))} title={t('editor.zoomIn')}>＋</button>
        <label className="flex items-center gap-1 text-xs text-mute"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{t('editor.snap')}</label>
        <label className="flex items-center gap-1 text-xs text-mute"><input type="checkbox" checked={safeArea} onChange={(e) => setSafeArea(e.target.checked)} />{t('editor.safeArea')}</label>
        <div className="ms-auto flex items-center gap-1.5">
          {dirty && <span className="text-xs text-warn">{t('common.unsaved')}</span>}
          <button className="btn btn-ghost btn-sm" onClick={rebuild} disabled={ro || !!busy}>{t('editor.rebuild')}</button>
          <button className="btn btn-ghost btn-sm" onClick={openVersions} disabled={!!busy}>{t('editor.versions')}</button>
          <button className="btn btn-ghost btn-sm" onClick={saveVersion} disabled={ro || !!busy}>{t('editor.saveVersion')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={ro || !dirty || !!busy} data-testid="editor-save">{busy === 'save' && <Spinner />}{t('common.save')}</button>
        </div>
      </div>
      {conflict && (
        <div className="flex items-center gap-3 border-b border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">
          {t('editor.conflict')} <button className="btn btn-danger btn-sm" onClick={reloadLatest}>{t('editor.reload')}</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="checker min-h-0 flex-1 p-4">
            <Player comp={comp} time={pb.time} playing={pb.playing} placeholders selectedClipId={selectedId} safeArea={safeArea}
              onSelect={(c) => setSelectedId(c?.id ?? null)} onDragClip={ro ? undefined : onDragClip} />
          </div>
          <div dir="ltr" className="flex items-center gap-3 border-t border-line bg-panel px-4 py-2">
            <button className="btn btn-soft btn-sm" onClick={pb.toggle} aria-label={pb.playing ? t('common.pause') : t('common.play')} data-testid="editor-play">{pb.playing ? '❚❚' : '▶'}</button>
            <span className="font-mono text-xs text-ink-2">{fmt(pb.time)} / {fmt(comp.durationMs)}</span>
            <span className="ms-auto hidden text-[11px] text-mute md:inline">{t('editor.shortcuts')}</span>
          </div>
        </div>
        <aside className="scroll-thin hidden w-80 shrink-0 overflow-y-auto border-s border-line bg-panel md:block">
          <div className="border-b border-line px-4 py-2.5 font-display text-sm font-semibold">{t('editor.inspector')}</div>
          <Inspector clip={selected} onPickMedia={() => openPicker('replace')} onChange={(patch, key) => { if (selected && !ro) apply(updateClip(comp, selected.id, patch), key); }} />
        </aside>
      </div>
      <div className="shrink-0" style={{ height: Math.min(360, timelineHeight(comp.tracks.length)) }}>
        <Timeline comp={comp} time={pb.time} pxPerSec={pxPerSec} selectedId={selectedId} snap={snap}
          onSelect={setSelectedId} onSeek={pb.setTime} onChange={(c, commit) => { if (ro) return; if (commit) apply(c); else setComp(c); }} />
      </div>

      <Modal open={!!picker} onClose={() => setPicker(null)} title={picker === 'replace' ? t('editor.replaceMedia') : t('editor.addMedia')} wide>
        {assets.length === 0 ? <p className="text-sm text-mute">{t('assets.none')}</p> : (
          <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
            {assets.map((a) => (
              <button key={a.id} className="card overflow-hidden text-start" onClick={() => pickAsset(a)}>
                {a.kind === 'image' ? <img src={assetUrl(a.id)} alt="" className="aspect-square w-full object-cover" /> : a.kind === 'video' ? <video src={assetUrl(a.id)} muted className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-2xl">♪</div>}
                <div className="truncate p-2 text-[11px] text-mute">{a.name}</div>
              </button>
            ))}
          </div>
        )}
      </Modal>
      <Modal open={versionsOpen} onClose={() => setVersionsOpen(false)} title={t('editor.versions')}>
        {versions.length === 0 ? <p className="text-sm text-mute">{t('common.empty')}</p> : (
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.id} className={cx('flex items-center justify-between gap-3 py-2 text-sm')}>
                <span><span className="font-mono text-mute">v{v.version}</span> {v.label} <span className="text-xs text-mute">· {date(v.createdAt)}</span></span>
                <button className="btn btn-ghost btn-sm" disabled={ro} onClick={() => restore(v.id)}>{t('editor.restore')}</button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
