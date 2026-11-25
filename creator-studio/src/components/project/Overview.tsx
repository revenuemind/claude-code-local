'use client';
import { useRouter } from 'next/navigation';
import { useI18n } from '../I18nProvider';
import { Player, usePlayback, TransportBar } from '../Player';
import { useAction } from '../ui';
import { apiFetch } from '@/lib/client/api';
import { useProject } from './ProjectWorkspace';

export function Overview() {
  const { t, dur, date } = useI18n();
  const { project, go, perms } = useProject();
  const router = useRouter();
  const { busy, run } = useAction();
  const comp = project.composition;
  const pb = usePlayback(comp, { audio: true });
  const plan = project.plan;
  const next: Array<{ label: string; stage: Parameters<typeof go>[0] }> = [];
  if (!project.planApprovedAt) next.push({ label: t('plan.approve'), stage: 'plan' });
  if (plan && plan.requirements.missingAssets.length) next.push({ label: t('generate.generateAll'), stage: 'generate' });
  next.push({ label: t('editor.title'), stage: 'editor' }, { label: t('export.render'), stage: 'export' });

  const duplicate = () => run('dup', async () => { const r = await apiFetch<{ project: { id: string } }>(`/api/projects/${project.id}/duplicate`, { body: {} }); router.push(`/projects/${r.project.id}`); }, t('projects.duplicated'));
  const remove = () => run('del', async () => { if (!confirm(t('projects.deleteConfirm'))) return; await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' }); router.push('/projects'); });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="checker flex h-[min(70vh,680px)] items-center justify-center rounded-2xl p-4">
          {comp ? <Player comp={comp} time={pb.time} playing={pb.playing} maxHeight="100%" /> : <span className="text-mute">—</span>}
        </div>
        {comp && <TransportBar pb={pb} duration={comp.durationMs} />}
      </div>
      <div className="space-y-4">
        <div className="card grid grid-cols-2 gap-4 p-5 text-sm">
          <div><div className="text-xs text-mute">{t('plan.totalDuration')}</div><div className="font-display text-xl font-bold">{comp ? dur(comp.durationMs / 1000) : '—'}</div></div>
          <div><div className="text-xs text-mute">{t('plan.scenes')}</div><div className="font-display text-xl font-bold">{plan?.scenes.length ?? 0}</div></div>
          <div><div className="text-xs text-mute">{t('plan.title')}</div><div className="font-semibold">{project.planApprovedAt ? `✓ ${t('plan.approved')}` : t('plan.notApproved')}</div></div>
          <div><div className="text-xs text-mute">{t('common.updated')}</div><div className="font-semibold">{date(project.updatedAt)}</div></div>
        </div>
        {plan && (
          <div className="card space-y-2 p-5">
            <div className="text-xs text-mute">{t('plan.hook')}</div>
            <p className="font-display text-lg font-semibold" dir="auto">{plan.hook.replace(/\*/g, '')}</p>
            <p className="text-sm text-ink-2" dir="auto">{plan.concept}</p>
          </div>
        )}
        <div className="card space-y-2 p-5">
          {next.map((n) => <button key={n.label} className="btn btn-soft w-full justify-between" onClick={() => go(n.stage)}>{n.label}<span aria-hidden>→</span></button>)}
        </div>
        <div className="flex gap-2">
          {perms.write && <button className="btn btn-ghost" disabled={!!busy} onClick={duplicate}>{t('common.duplicate')}</button>}
          {perms.del && <button className="btn btn-danger" disabled={!!busy} onClick={remove}>{t('common.delete')}</button>}
        </div>
      </div>
    </div>
  );
}
