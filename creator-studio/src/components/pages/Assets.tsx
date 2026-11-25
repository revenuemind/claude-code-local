'use client';
import { useEffect, useState } from 'react';
import type { ClientAsset } from '@/lib/client/types';
import { apiFetch, assetUrl } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Empty, PageHeader, Spinner, Tabs, useAction } from '../ui';

const KINDS = ['all', 'image', 'video', 'audio', 'render', 'subtitle', 'thumbnail'] as const;

export function Assets() {
  const { t, date, num } = useI18n();
  const { busy, run } = useAction();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const [assets, setAssets] = useState<ClientAsset[] | null>(null);
  const [drag, setDrag] = useState(false);
  const load = async () => setAssets((await apiFetch<{ assets: ClientAsset[] }>(`/api/assets${kind === 'all' ? '' : `?kind=${kind}`}`)).assets);
  useEffect(() => { void load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = (files: FileList | File[]) => run('up', async () => {
    for (const f of Array.from(files)) { const fd = new FormData(); fd.append('file', f); await apiFetch('/api/assets', { form: fd }); }
    await load();
  }, t('common.saved'));
  const remove = (id: string) => run('del', async () => { if (!confirm(t('common.areYouSure'))) return; await apiFetch(`/api/assets/${id}`, { method: 'DELETE' }); await load(); });

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}>
      <PageHeader title={t('assets.title')} subtitle={t('assets.uploadHint')} actions={
        <label className="btn btn-primary">{busy === 'up' ? <Spinner /> : '⇪'} {t('common.upload')}<input type="file" multiple className="hidden" accept="image/*,video/*,audio/*" onChange={(e) => e.target.files && upload(e.target.files)} data-testid="asset-upload" /></label>
      } />
      <div className="mb-4"><Tabs value={kind} onChange={setKind} items={KINDS.map((k) => ({ value: k, label: k === 'all' ? t('common.all') : t(`assets.kinds.${k}`) }))} /></div>
      {drag && <div className="card mb-4 border-dashed border-accent p-8 text-center text-accent-2">⇪ {t('common.upload')}</div>}
      {!assets ? <Spinner /> : assets.length === 0 ? <Empty title={t('assets.none')} /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {assets.map((a) => (
            <div key={a.id} className="card overflow-hidden" data-testid="asset-card">
              <div className="checker aspect-square">
                {(a.kind === 'image' || a.kind === 'thumbnail') && <img src={assetUrl(a.id)} alt={a.name} className="h-full w-full object-contain" loading="lazy" />}
                {(a.kind === 'video' || a.kind === 'render') && <video src={assetUrl(a.id)} className="h-full w-full object-contain" muted controls preload="metadata" />}
                {a.kind === 'audio' && <div className="flex h-full flex-col items-center justify-center gap-2 p-2"><span className="text-3xl">♪</span><audio controls src={assetUrl(a.id)} className="w-full" /></div>}
                {a.kind === 'subtitle' && <div className="grid h-full place-items-center text-3xl">CC</div>}
              </div>
              <div className="space-y-1 p-2.5 text-xs">
                <div className="truncate font-medium" title={a.name}>{a.name}</div>
                <div className="text-mute">{t(`assets.kinds.${a.kind}`)} · {num(a.sizeBytes / 1024 / 1024, { maximumFractionDigits: 1 })} MB{a.width ? ` · ${a.width}×${a.height}` : ''}</div>
                <div className="text-mute">{a.source}{a.providerId ? ` · ${a.providerId}` : ''} · {date(a.createdAt, { dateStyle: 'short' })}</div>
                <div className="flex gap-1 pt-1">
                  <a className="btn btn-ghost btn-sm" href={assetUrl(a.id, true)}>⬇</a>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
