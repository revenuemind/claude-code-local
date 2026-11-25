'use client';
import { useEffect, useState } from 'react';
import type { PlanScene, ProductionPlan, SceneMediaMode } from '@/lib/planning/types';
import type { ClientProject } from '@/lib/client/types';
import { apiFetch } from '@/lib/client/api';
import { useEngines, usableProviders } from '@/lib/client/useEngines';
import { useI18n } from '../I18nProvider';
import { Field, Spinner, StatusBadge, cx, useAction, Progress } from '../ui';
import { useProject } from './ProjectWorkspace';

const MODES_FOR: Record<PlanScene['mediaKind'], SceneMediaMode[]> = {
  none: ['code', 'ai-image', 'ai-video', 'upload'], image: ['code', 'ai-image', 'ai-video', 'upload'], video: ['code', 'ai-video', 'ai-image', 'upload'], avatar: ['avatar', 'upload', 'ai-video', 'code'],
};

export function PlanStage() {
  const { t, dur } = useI18n();
  const { project, setProject, jobs, refreshJobs, perms, go } = useProject();
  const { busy, run } = useAction();
  const [plan, setPlan] = useState<ProductionPlan | null>(project.plan);
  const [dirty, setDirty] = useState(false);
  const { data: engines } = useEngines();
  const llms = usableProviders(engines, 'llm');
  const [engine, setEngine] = useState('offline');
  useEffect(() => { if (!dirty) setPlan(project.plan); }, [project.plan, dirty]);
  useEffect(() => { if (engines?.preferences.planner) setEngine(engines.preferences.planner.providerId); }, [engines]);
  const planJob = jobs.find((j) => j.type === 'plan.generate' && (j.status === 'queued' || j.status === 'running'));
  const lastPlanJob = jobs.find((j) => j.type === 'plan.generate');

  if (!plan) return <div className="card p-6 text-mute">—</div>;
  const upd = (p: ProductionPlan) => { setPlan(p); setDirty(true); };
  const updScene = (id: string, patch: Partial<PlanScene>) => upd({ ...plan, scenes: plan.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const total = plan.scenes.reduce((n, s) => n + s.durationSec, 0);

  const save = () => run('save', async () => { const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/plan`, { method: 'PUT', body: { plan } }); setProject(r.project); setDirty(false); }, t('common.saved'));
  const redraft = () => run('redraft', async () => { if (dirty && !confirm(t('common.areYouSure'))) return; const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/plan/redraft`, { body: {} }); setDirty(false); setProject(r.project); });
  const generate = () => run('gen', async () => {
    const p = engines?.providers.find((x) => x.id === engine);
    await apiFetch(`/api/projects/${project.id}/plan/generate`, { body: engine === 'offline' ? { providerId: 'offline' } : { providerId: engine, modelId: engines?.preferences.planner?.providerId === engine ? engines.preferences.planner.modelId : p?.models.find((m) => m.capability === 'llm' && m.default)?.id ?? p?.models.find((m) => m.capability === 'llm')?.id } });
    setDirty(false); await refreshJobs();
  });
  const approve = () => run('approve', async () => {
    if (dirty) { const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/plan`, { method: 'PUT', body: { plan } }); setProject(r.project); setDirty(false); }
    const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}/plan/approve`, { body: {} });
    setProject(r.project);
    go(r.project.plan?.requirements.missingAssets.length ? 'generate' : 'editor');
  }, t('plan.approved'));

  const req = plan.requirements;
  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-mute">{t('plan.engineLabel')}</span>
          <select className="field !w-auto" value={engine} onChange={(e) => setEngine(e.target.value)} aria-label={t('plan.engineLabel')}>
            <option value="offline">{t('plan.offlinePlanner')}</option>
            {llms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn-soft" disabled={!perms.generate || !!busy || !!planJob} onClick={generate} data-testid="plan-generate">{planJob ? <Spinner /> : '✦'} {t('plan.generateAi')}</button>
        </div>
        <button className="btn btn-ghost" disabled={!perms.write || !!busy} onClick={redraft}>{t('plan.redraft')}</button>
        <div className="ms-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-warn">{t('common.unsaved')}</span>}
          <button className="btn btn-ghost" disabled={!perms.write || !dirty || !!busy} onClick={save}>{busy === 'save' && <Spinner />}{t('common.save')}</button>
          <button className="btn btn-primary" disabled={!perms.write || !!busy} onClick={approve} data-testid="approve-plan">{busy === 'approve' && <Spinner />}{t('plan.approve')}</button>
        </div>
        {planJob && <div className="w-full"><Progress value={planJob.progress} /></div>}
        {lastPlanJob?.status === 'failed' && <div className="w-full text-xs text-bad">{lastPlanJob.error}</div>}
        <p className="w-full text-xs text-mute">{t('plan.approveHint')} · {t('plan.generatedBy')}: <span className="font-mono">{plan.generatedBy}</span> · {project.planApprovedAt ? `✓ ${t('plan.approved')}` : t('plan.notApproved')}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="card grid gap-4 p-5 md:grid-cols-2">
            <Field label={t('plan.concept')}><textarea dir="auto" className="field h-20" value={plan.concept} onChange={(e) => upd({ ...plan, concept: e.target.value })} /></Field>
            <Field label={t('plan.hook')}><textarea dir="auto" className="field h-20" value={plan.hook} onChange={(e) => upd({ ...plan, hook: e.target.value })} /></Field>
            <Field label={t('plan.visualDirection')}><textarea dir="auto" className="field h-16" value={plan.visualDirection} onChange={(e) => upd({ ...plan, visualDirection: e.target.value })} /></Field>
            <Field label={t('plan.music')}><textarea dir="auto" className="field h-16" value={plan.music.direction} onChange={(e) => upd({ ...plan, music: { ...plan.music, direction: e.target.value } })} /></Field>
            <div className="flex flex-wrap gap-5 md:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.voice.enabled} onChange={(e) => upd({ ...plan, voice: { ...plan.voice, enabled: e.target.checked } })} /> {t('plan.voice')}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan.subtitles.enabled} onChange={(e) => upd({ ...plan, subtitles: { ...plan.subtitles, enabled: e.target.checked } })} /> {t('plan.subtitles')}</label>
              <select className="field !w-auto !py-1 text-xs" value={plan.subtitles.preset} onChange={(e) => upd({ ...plan, subtitles: { ...plan.subtitles, preset: e.target.value as ProductionPlan['subtitles']['preset'] } })} aria-label={t('editor.captionStyle')}>
                {['bold-pop', 'karaoke', 'minimal', 'boxed', 'neon'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <h2 className="font-display text-lg font-semibold">{t('plan.scenes')} · {dur(total)}</h2>
          {plan.scenes.map((s, i) => (
            <div key={s.id} className="card space-y-3 p-5" data-testid="plan-scene">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-panel-3 font-mono text-xs">{i + 1}</span>
                <span className="font-semibold">{t(`layouts.${s.layout}`)}</span>
                <span className="badge">{s.role}</span>
                <div className="ms-auto flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-mute">{t('plan.duration')}
                    <input type="number" min={0.5} max={600} step={0.1} className="field !w-20 !py-1" value={s.durationSec} onChange={(e) => updScene(s.id, { durationSec: Number(e.target.value) })} />s
                  </label>
                  <select className="field !w-auto !py-1 text-xs" value={s.mediaMode} onChange={(e) => updScene(s.id, { mediaMode: e.target.value as SceneMediaMode })} aria-label={t('plan.mediaMode')}>
                    {MODES_FOR[s.mediaKind].map((m) => <option key={m} value={m}>{t(`plan.mediaModes.${m}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {s.kicker !== undefined && <Field label="Kicker"><input dir="auto" className="field" value={s.kicker} onChange={(e) => updScene(s.id, { kicker: e.target.value })} /></Field>}
                <Field label={t('plan.onScreen')}><input dir="auto" className="field" value={s.headline} onChange={(e) => updScene(s.id, { headline: e.target.value })} /></Field>
                {s.body !== undefined && <Field label={t('templateEditor.body')}><input dir="auto" className="field" value={s.body} onChange={(e) => updScene(s.id, { body: e.target.value })} /></Field>}
                {s.label !== undefined && <Field label={t('templateEditor.label')}><input dir="auto" className="field" value={s.label} onChange={(e) => updScene(s.id, { label: e.target.value })} /></Field>}
                {s.left && <Field label="A"><input dir="auto" className="field" value={`${s.left.title}${s.left.body ? ` — ${s.left.body}` : ''}`} onChange={(e) => { const [a, ...b] = e.target.value.split(' — '); updScene(s.id, { left: { title: a, body: b.join(' — ') || undefined } }); }} /></Field>}
                {s.right && <Field label="B"><input dir="auto" className="field" value={`${s.right.title}${s.right.body ? ` — ${s.right.body}` : ''}`} onChange={(e) => { const [a, ...b] = e.target.value.split(' — '); updScene(s.id, { right: { title: a, body: b.join(' — ') || undefined } }); }} /></Field>}
                {s.bullets && <Field label="•"><textarea dir="auto" className="field h-20" value={s.bullets.join('\n')} onChange={(e) => updScene(s.id, { bullets: e.target.value.split('\n') })} /></Field>}
                {s.stat && <Field label="#"><input type="number" className="field" value={s.stat.value} onChange={(e) => updScene(s.id, { stat: { ...s.stat!, value: Number(e.target.value) } })} /></Field>}
              </div>
              <Field label={t('plan.narration')}><textarea dir="auto" className="field h-16" value={s.narration} onChange={(e) => updScene(s.id, { narration: e.target.value })} /></Field>
              {s.mediaMode !== 'code' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t('plan.shot')}><textarea className="field h-16" dir="ltr" value={s.shotDescription} onChange={(e) => updScene(s.id, { shotDescription: e.target.value })} /></Field>
                  <Field label={t('plan.visualPrompt')}><textarea className="field h-16" dir="ltr" value={s.visualPrompt} onChange={(e) => updScene(s.id, { visualPrompt: e.target.value })} /></Field>
                </div>
              )}
              {s.media && <span className="badge badge-ok">✓ {s.media.kind}</span>}
            </div>
          ))}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="card p-5">
            <h3 className="label">{t('plan.requirements')}</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([['aiImages', req.aiImages], ['aiVideoClips', req.aiVideoClips], ['aiVideoSeconds', req.aiVideoSeconds], ['voiceoverChars', req.voiceoverChars], ['userMediaSlots', req.userMediaSlots]] as const).map(([k, v]) => (
                <div key={k} className={cx('rounded-lg bg-panel-2 p-2.5', v ? '' : 'opacity-50')}><dt className="text-[11px] text-mute">{t(`plan.req.${k}`)}</dt><dd className="font-display text-lg font-bold">{v}</dd></div>
              ))}
            </dl>
            {req.missingAssets.length > 0 && <div className="mt-3"><StatusBadge status="queued" label={`${t('plan.req.missing')}: ${req.missingAssets.length}`} /></div>}
          </div>
          <div className="card p-5">
            <h3 className="label">{t('plan.rationale')}</h3>
            <ul className="space-y-2 text-sm text-ink-2">{plan.rationale.map((r, i) => <li key={i} className="flex gap-2"><span className="text-accent-2">✦</span><span>{r}</span></li>)}</ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
