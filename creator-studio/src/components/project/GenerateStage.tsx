'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanScene, SceneMediaMode } from '@/lib/planning/types';
import type { ClientAsset, ClientJob, ClientProject } from '@/lib/client/types';
import { apiFetch, assetUrl } from '@/lib/client/api';
import { useEngines, usableProviders } from '@/lib/client/useEngines';
import { useI18n } from '../I18nProvider';
import { Field, Modal, Progress, Spinner, StatusBadge, cx, useAction } from '../ui';
import { Player } from '../Player';
import { useProject } from './ProjectWorkspace';

function AssetThumb({ a, className }: { a: ClientAsset; className?: string }) {
  if (a.kind === 'video') return <video src={assetUrl(a.id)} className={className} muted loop playsInline onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />;
  return <img src={assetUrl(a.id)} alt={a.name} className={className} loading="lazy" />;
}

export function JobRow({ j, onChanged }: { j: ClientJob; onChanged: () => void }) {
  const { t, date } = useI18n();
  const { run } = useAction();
  return (
    <div className="space-y-1.5 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{t(`generate.jobTypes.${j.type}`)}</span>
        {j.providerId && <span className="text-xs text-mute">{j.providerId}{j.modelId ? ` · ${j.modelId}` : ''}</span>}
        <span className="ms-auto"><StatusBadge status={j.status} label={t(`generate.jobStatus.${j.status}`)} /></span>
      </div>
      {(j.status === 'running' || j.status === 'queued') && <Progress value={j.progress} />}
      {j.error && <p className="line-clamp-3 text-xs text-bad" dir="ltr">{j.error}</p>}
      <div className="flex items-center gap-2 text-xs text-mute">
        <span>{date(j.createdAt)}</span>
        {j.attempts > 1 && <span>· {j.attempts}/{j.maxAttempts}</span>}
        {(j.status === 'queued' || j.status === 'running') && <button className="btn btn-ghost btn-sm ms-auto" onClick={() => run('c', async () => { await apiFetch(`/api/jobs/${j.id}/cancel`, { body: {} }); onChanged(); })}>{t('generate.cancelJob')}</button>}
        {(j.status === 'failed' || j.status === 'canceled') && <button className="btn btn-ghost btn-sm ms-auto" onClick={() => run('r', async () => { await apiFetch(`/api/jobs/${j.id}/retry`, { body: {} }); onChanged(); })}>{t('generate.retryJob')}</button>}
      </div>
    </div>
  );
}

function SceneCard({ s, index, assets, jobs, onChanged }: { s: PlanScene; index: number; assets: ClientAsset[]; jobs: ClientJob[]; onChanged: () => void }) {
  const { t } = useI18n();
  const { project, setProject, perms, refreshJobs } = useProject();
  const { data: engines } = useEngines();
  const { busy, run } = useAction();
  const [prompt, setPrompt] = useState(s.visualPrompt);
  const [variants, setVariants] = useState(1);
  const [kind, setKind] = useState<'image' | 'video'>(s.mediaMode === 'ai-video' || s.mediaMode === 'avatar' ? 'video' : 'image');
  const providers = usableProviders(engines, kind);
  const pref = engines?.preferences[kind];
  const [providerId, setProviderId] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [picking, setPicking] = useState(false);
  useEffect(() => { setPrompt(s.visualPrompt); }, [s.visualPrompt]);
  useEffect(() => {
    const p = providers.find((x) => x.id === pref?.providerId) ?? providers[0];
    setProviderId(p?.id ?? ''); setModelId(pref?.providerId === p?.id ? pref?.modelId ?? '' : p?.models.find((m) => m.capability === kind && m.default)?.id ?? p?.models.find((m) => m.capability === kind)?.id ?? '');
  }, [kind, engines]); // eslint-disable-line react-hooks/exhaustive-deps
  const provider = providers.find((p) => p.id === providerId);
  const sceneJobs = jobs.filter((j) => j.sceneId === s.id);
  const active = sceneJobs.some((j) => j.status === 'queued' || j.status === 'running');
  const history = assets.filter((a) => (a.kind === 'image' || a.kind === 'video') && a.meta?.sceneId === s.id);
  const current = s.media ? assets.find((a) => a.id === s.media!.assetId) : null;
  const comp = project.composition;
  const bg = comp?.tracks.find((tr) => tr.role === 'background')?.clips.find((c) => c.sceneId === s.id);

  const setMode = (m: SceneMediaMode) => run('mode', async () => { const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/scenes/${s.id}`, { method: 'PATCH', body: { mediaMode: m } }); setProject(r.project); });
  const assign = (assetId: string | null) => run('assign', async () => { const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/scenes/${s.id}/media`, { body: { assetId } }); setProject(r.project); setPicking(false); onChanged(); });
  const generate = () => run('gen', async () => {
    await apiFetch(`/api/projects/${project.id}/scenes/${s.id}/generate`, { body: { kind, prompt, variants, providerId, modelId } });
    await refreshJobs();
  });
  const upload = (f: File) => run('upload', async () => {
    const fd = new FormData(); fd.append('file', f); fd.append('projectId', project.id);
    const r = await apiFetch<{ asset: ClientAsset }>('/api/assets', { form: fd });
    const p = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/scenes/${s.id}/media`, { body: { assetId: r.asset.id } });
    setProject(p.project); onChanged();
  });

  return (
    <div className="card overflow-hidden" data-testid="scene-card">
      <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="checker relative flex min-h-[200px] items-center justify-center p-2">
          {current ? <AssetThumb a={current} className="max-h-[260px] w-full rounded-lg object-contain" />
            : comp && bg ? <div className="h-[260px] w-full"><Player comp={comp} time={bg.start + bg.duration * 0.6} placeholders maxHeight={260} /></div> : null}
          <span className="absolute start-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/70 font-mono text-xs">{index + 1}</span>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t(`layouts.${s.layout}`)}</span>
            <span className="truncate text-sm text-mute" dir="auto">{s.headline.replace(/\*/g, '')}</span>
            <select className="field ms-auto !w-auto !py-1 text-xs" value={s.mediaMode} disabled={!perms.write} onChange={(e) => setMode(e.target.value as SceneMediaMode)} aria-label={t('plan.mediaMode')}>
              {(['code', 'ai-image', 'ai-video', 'upload', 'avatar'] as SceneMediaMode[]).map((m) => <option key={m} value={m}>{t(`plan.mediaModes.${m}`)}</option>)}
            </select>
          </div>
          {s.mediaMode === 'code' && !s.media ? <p className="text-xs text-mute">{s.mediaKind === 'none' ? t('generate.noMediaNeeded') : t('wizard.modeHelp.code')}</p> : (
            <>
              {(s.mediaMode === 'ai-image' || s.mediaMode === 'ai-video' || s.mediaMode === 'avatar') && (
                <div className="space-y-2">
                  <Field label={t('generate.prompt')}><textarea dir="ltr" className="field h-16 text-xs" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
                  <div className="flex flex-wrap items-end gap-2">
                    <select className="field !w-auto !py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as 'image' | 'video')} aria-label="kind">
                      <option value="image">{t('generate.image')}</option><option value="video">{t('generate.video')}</option>
                    </select>
                    <select className="field !w-auto !py-1 text-xs" value={providerId} onChange={(e) => { setProviderId(e.target.value); const p = providers.find((x) => x.id === e.target.value); setModelId(p?.models.find((m) => m.capability === kind && m.default)?.id ?? p?.models.find((m) => m.capability === kind)?.id ?? ''); }} aria-label={t('generate.engine')}>
                      {providers.length === 0 && <option value="">— {t('engines.connectKey')} —</option>}
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {provider && provider.models.filter((m) => m.capability === kind).length > 0 && (
                      <select className="field !w-auto !py-1 text-xs" value={modelId} onChange={(e) => setModelId(e.target.value)} aria-label={t('generate.model')}>
                        {provider.models.filter((m) => m.capability === kind).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                    <label className="flex items-center gap-1 text-xs text-mute">{t('generate.variants')}<input type="number" min={1} max={4} className="field !w-14 !py-1" value={variants} onChange={(e) => setVariants(Number(e.target.value))} /></label>
                    <button className="btn btn-primary btn-sm" disabled={!perms.generate || !providerId || !!busy || active} onClick={generate} data-testid="scene-generate">{(busy === 'gen' || active) && <Spinner />}✦ {kind === 'video' ? t('generate.video') : t('generate.image')}</button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className={cx('btn btn-ghost btn-sm', (!perms.write || !!busy) && 'pointer-events-none opacity-50')}>
                  {busy === 'upload' ? <Spinner /> : '⇪'} {t('generate.upload')}
                  <input type="file" className="hidden" accept="image/*,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => setPicking(true)} disabled={!perms.write}>{t('generate.pick')}</button>
                {s.media && <button className="btn btn-ghost btn-sm" onClick={() => assign(null)} disabled={!perms.write}>{t('generate.clear')}</button>}
              </div>
              {history.length > 0 && (
                <div>
                  <div className="label">{t('generate.history')}</div>
                  <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
                    {history.map((a) => (
                      <button key={a.id} onClick={() => assign(a.id)} className={cx('relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2', s.media?.assetId === a.id ? 'border-accent' : 'border-transparent')} title={a.prompt ?? a.name}>
                        <AssetThumb a={a} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {sceneJobs.length > 0 && <div className="card divide-y divide-line">{sceneJobs.slice(0, 3).map((j) => <JobRow key={j.id} j={j} onChanged={refreshJobs} />)}</div>}
        </div>
      </div>
      <Modal open={picking} onClose={() => setPicking(false)} title={t('generate.pick')} wide>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {assets.filter((a) => a.kind === 'image' || a.kind === 'video').map((a) => (
            <button key={a.id} onClick={() => assign(a.id)} className="card overflow-hidden text-start">
              <AssetThumb a={a} className="aspect-square w-full object-cover" />
              <div className="truncate p-2 text-[11px] text-mute">{a.name}</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export function GenerateStage() {
  const { t, usd } = useI18n();
  const { project, jobs, refreshJobs, perms } = useProject();
  const { data: engines } = useEngines();
  const { busy, run } = useAction();
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const loadAssets = useCallback(async () => { setAssets((await apiFetch<{ assets: ClientAsset[] }>(`/api/assets?projectId=${project.id}`)).assets); }, [project.id]);
  useEffect(() => { void loadAssets(); }, [loadAssets, project.updatedAt]);
  const plan = project.plan;
  const tts = usableProviders(engines, 'tts');
  const music = usableProviders(engines, 'music');
  const [ttsId, setTtsId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [musicId, setMusicId] = useState('builtin');
  const [musicPrompt, setMusicPrompt] = useState('');
  useEffect(() => { if (engines) { setTtsId(engines.preferences.tts?.providerId ?? ''); setVoiceId(engines.preferences.tts?.voiceId ?? ''); setMusicId(engines.preferences.music?.providerId ?? 'builtin'); } }, [engines]);
  const missing = plan?.requirements.missingAssets.length ?? 0;
  const est = useMemo(() => {
    if (!engines || !plan) return null;
    let sum = 0;
    for (const s of plan.scenes) {
      if (s.media || s.mediaKind === 'none') continue;
      const task = s.mediaMode === 'ai-image' ? 'image' : s.mediaMode === 'ai-video' || s.mediaMode === 'avatar' ? 'video' : null;
      if (!task) continue;
      const pref = engines.preferences[task];
      const m = engines.providers.find((p) => p.id === pref?.providerId)?.models.find((x) => x.id === pref?.modelId);
      if (m?.cost) sum += m.cost.unit === 'image' ? m.cost.usd : m.cost.unit === 'second' ? m.cost.usd * Math.min(8, s.durationSec) : 0;
    }
    return sum;
  }, [engines, plan]);

  if (!plan) return null;
  const generateAll = () => run('all', async () => { await apiFetch(`/api/projects/${project.id}/generate-all`, { body: {} }); await refreshJobs(); });
  const voice = () => run('voice', async () => { const p = engines?.providers.find((x) => x.id === ttsId); await apiFetch(`/api/projects/${project.id}/voiceover`, { body: { providerId: ttsId, modelId: engines?.preferences.tts?.providerId === ttsId ? engines.preferences.tts.modelId : p?.models.find((m) => m.capability === 'tts' && m.default)?.id, voiceId: voiceId || undefined } }); await refreshJobs(); });
  const genMusic = () => run('music', async () => { await apiFetch(`/api/projects/${project.id}/music`, { body: { providerId: musicId, prompt: musicPrompt || undefined } }); await refreshJobs(); });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div>
            <div className="font-display font-semibold">{t('generate.title')}</div>
            <div className="text-xs text-mute">{t('generate.subtitle')}</div>
          </div>
          <div className="ms-auto flex items-center gap-3">
            {est !== null && est > 0 && <span className="text-xs text-mute">{t('generate.estimated')}: ~{usd(est)}</span>}
            <button className="btn btn-primary" disabled={!perms.generate || !missing || !!busy} onClick={generateAll}>{busy === 'all' && <Spinner />}✦ {t('generate.generateAll')} ({missing})</button>
          </div>
          <p className="w-full text-xs text-mute">{t('generate.manualHint')}</p>
        </div>
        {plan.scenes.map((s, i) => <SceneCard key={s.id} s={s} index={i} assets={assets} jobs={jobs} onChanged={loadAssets} />)}
      </div>
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="card space-y-3 p-5">
          <h3 className="font-display font-semibold">{t('generate.voiceover')}</h3>
          <select className="field" value={ttsId} onChange={(e) => setTtsId(e.target.value)} aria-label={t('generate.engine')}>
            {tts.length === 0 && <option value="">— {t('engines.connectKey')} —</option>}
            {tts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Field label={t('generate.voiceId')}><input className="field" dir="ltr" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="alloy / ElevenLabs voice id" /></Field>
          <button className="btn btn-soft w-full" disabled={!perms.generate || !ttsId || !!busy} onClick={voice}>{busy === 'voice' && <Spinner />}{t('generate.voiceGenerate')}</button>
          {plan.voiceAssets && <p className="text-xs text-ok">✓ {Object.keys(plan.voiceAssets).length} / {plan.scenes.length}</p>}
        </div>
        <div className="card space-y-3 p-5">
          <h3 className="font-display font-semibold">{t('generate.music')}</h3>
          <select className="field" value={musicId} onChange={(e) => setMusicId(e.target.value)} aria-label={t('generate.engine')}>
            {music.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Field label={t('generate.musicPrompt')}><input className="field" dir="ltr" value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} placeholder={plan.music.direction} /></Field>
          <button className="btn btn-soft w-full" disabled={!perms.generate || !!busy} onClick={genMusic} data-testid="music-generate">{busy === 'music' && <Spinner />}{t('generate.musicGenerate')}</button>
          {plan.music.assetId && <audio controls className="w-full" src={assetUrl(plan.music.assetId)} />}
        </div>
        <div className="card">
          <h3 className="border-b border-line px-4 py-3 font-display font-semibold">{t('generate.jobs')}</h3>
          {jobs.length === 0 ? <p className="p-4 text-sm text-mute">{t('generate.noJobs')}</p> : <div className="scroll-thin max-h-[480px] divide-y divide-line overflow-y-auto">{jobs.map((j) => <JobRow key={j.id} j={j} onChanged={refreshJobs} />)}</div>}
        </div>
      </aside>
    </div>
  );
}
