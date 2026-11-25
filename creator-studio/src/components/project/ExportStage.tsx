'use client';
import { useCallback, useEffect, useState } from 'react';
import { EXPORT_PRESETS } from '@/lib/render/presets';
import type { ClientRender } from '@/lib/client/types';
import { apiFetch, assetUrl } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Field, Progress, Spinner, StatusBadge, cx, useAction } from '../ui';
import { useProject } from './ProjectWorkspace';

export function ExportStage() {
  const { t, date, dur } = useI18n();
  const { project, jobs, refreshJobs, perms } = useProject();
  const { busy, run } = useAction();
  const [renders, setRenders] = useState<ClientRender[]>([]);
  const [preset, setPreset] = useState('preview-720');
  const [custom, setCustom] = useState({ width: 1080, height: 1920, fps: 30 });
  const load = useCallback(async () => { setRenders((await apiFetch<{ renders: ClientRender[] }>(`/api/projects/${project.id}/renders`)).renders.reverse()); }, [project.id]);
  const renderJobs = jobs.filter((j) => j.type === 'render.video');
  const activeKey = renderJobs.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => `${j.id}:${j.status}`).join(',');
  useEffect(() => { void load(); }, [load, activeKey]);

  const render = () => run('render', async () => {
    await apiFetch(`/api/projects/${project.id}/renders`, { body: preset === 'custom' ? { presetId: 'custom', ...custom } : { presetId: preset } });
    await refreshJobs(); await load();
  });
  const latest = renders.find((r) => r.status === 'succeeded');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <h3 className="font-display font-semibold">{t('export.presets')}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXPORT_PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)} className={cx('card p-3 text-start transition', preset === p.id ? 'border-accent ring-2 ring-accent/30' : 'hover:border-line-2')} data-testid={`preset-${p.id}`}>
                <div className="flex items-center justify-between"><span className="font-semibold">{p.name}</span><span className="badge">{p.id === 'preview-720' ? project.settings.aspect : p.aspect}</span></div>
                <div className="mt-1 text-xs text-mute">{p.id === 'preview-720' ? '720p' : `${p.width}×${p.height}`} · {p.fps}fps{p.maxDurationSec ? ` · ≤${p.maxDurationSec}s` : ''}</div>
              </button>
            ))}
            <button onClick={() => setPreset('custom')} className={cx('card p-3 text-start', preset === 'custom' ? 'border-accent ring-2 ring-accent/30' : 'hover:border-line-2')}>
              <div className="font-semibold">{t('export.custom')}</div><div className="mt-1 text-xs text-mute">W × H</div>
            </button>
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label={t('export.width')}><input type="number" className="field" value={custom.width} onChange={(e) => setCustom({ ...custom, width: Number(e.target.value) })} /></Field>
              <Field label={t('export.height')}><input type="number" className="field" value={custom.height} onChange={(e) => setCustom({ ...custom, height: Number(e.target.value) })} /></Field>
              <Field label={t('export.fps')}><select className="field" value={custom.fps} onChange={(e) => setCustom({ ...custom, fps: Number(e.target.value) })}>{[24, 25, 30, 60].map((f) => <option key={f}>{f}</option>)}</select></Field>
            </div>
          )}
          <p className="text-xs text-mute">{t('export.reframeNote')}</p>
          <button className="btn btn-primary w-full" disabled={!perms.render || !!busy} onClick={render} data-testid="render-button">{busy && <Spinner />}▶ {t('export.render')}</button>
        </div>
        {latest?.videoAssetId && (
          <div className="card space-y-3 p-4">
            <video controls className="max-h-[60vh] w-full rounded-xl bg-black" src={assetUrl(latest.videoAssetId)} poster={latest.thumbnailAssetId ? assetUrl(latest.thumbnailAssetId) : undefined} data-testid="render-video">
              {latest.subtitleAssetId && <track kind="subtitles" src={assetUrl(latest.subtitleAssetId)} />}
            </video>
          </div>
        )}
      </div>
      <div className="card">
        <h3 className="border-b border-line px-5 py-3 font-display font-semibold">{t('export.renders')}</h3>
        {renders.length === 0 ? <p className="p-5 text-sm text-mute">{t('export.noRenders')}</p> : (
          <ul className="divide-y divide-line">
            {renders.map((r) => {
              const job = renderJobs.find((j) => j.id === r.jobId);
              return (
                <li key={r.id} className="space-y-2 px-5 py-4 text-sm" data-testid="render-row">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{EXPORT_PRESETS.find((p) => p.id === r.presetId)?.name ?? t('export.custom')}</span>
                    <span className="text-xs text-mute">{r.width}×{r.height} · {r.fps}fps{r.durationMs ? ` · ${dur(r.durationMs / 1000)}` : ''}</span>
                    <span className="ms-auto"><StatusBadge status={r.status} label={t(`generate.jobStatus.${r.status === 'running' ? 'running' : r.status}`)} /></span>
                  </div>
                  {job && (job.status === 'running' || job.status === 'queued') && <Progress value={job.progress} />}
                  {job?.error && r.status !== 'succeeded' && <p className="text-xs text-bad" dir="ltr">{job.error}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-mute">{date(r.createdAt)}</span>
                    {r.videoAssetId && <a className="btn btn-ghost btn-sm" href={assetUrl(r.videoAssetId, true)}>⬇ {t('export.downloadVideo')}</a>}
                    {r.subtitleAssetId && <a className="btn btn-ghost btn-sm" href={assetUrl(r.subtitleAssetId, true)}>⬇ {t('export.downloadSrt')}</a>}
                    {r.thumbnailAssetId && <a className="btn btn-ghost btn-sm" href={assetUrl(r.thumbnailAssetId, true)}>⬇ {t('export.thumbnail')}</a>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
