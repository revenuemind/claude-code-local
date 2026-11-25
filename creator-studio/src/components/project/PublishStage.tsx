'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ClientRender } from '@/lib/client/types';
import { apiFetch } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { Field, Spinner, StatusBadge, useAction } from '../ui';
import { useProject } from './ProjectWorkspace';

type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'blotato' | 'manual';
interface Account { id: string; platform: string; displayName: string; status: string }
interface Publication { id: string; platform: string; title: string; caption: string; status: string; scheduledAt: string | null; externalUrl: string | null; error: string | null; createdAt: string; privacy: string }

export function PublicationList({ items, onChanged }: { items: Publication[]; onChanged: () => void }) {
  const { t, date } = useI18n();
  const { run } = useAction();
  if (!items.length) return <p className="p-5 text-sm text-mute">{t('publish.noPosts')}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.id} className="space-y-1.5 px-5 py-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold capitalize">{p.platform}</span>
            <span className="truncate text-xs text-mute" dir="auto">{p.title || p.caption.slice(0, 60)}</span>
            <span className="ms-auto"><StatusBadge status={p.status} label={t(`publish.status.${p.status}`)} /></span>
          </div>
          {p.error && <p className="text-xs text-warn" dir="auto">{p.error}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <span>{p.scheduledAt ? `${t('publish.scheduleFor')} ${date(p.scheduledAt)}` : date(p.createdAt)}</span>
            {p.externalUrl && <a className="text-accent-2 hover:underline" href={p.externalUrl} target="_blank" rel="noreferrer">↗</a>}
            {p.status === 'draft' && <button className="btn btn-soft btn-sm" onClick={() => run('s', async () => { await apiFetch(`/api/publishing/publications/${p.id}/submit`, { body: {} }); onChanged(); })}>{t('publish.publishNow')}</button>}
            {['draft', 'scheduled', 'queued', 'failed'].includes(p.status) && <button className="btn btn-ghost btn-sm" onClick={() => run('c', async () => { await apiFetch(`/api/publishing/publications/${p.id}/cancel`, { body: {} }); onChanged(); })}>{t('common.cancel')}</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PublishStage() {
  const { t } = useI18n();
  const { project, perms } = useProject();
  const { busy, run } = useAction();
  const [renders, setRenders] = useState<ClientRender[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [form, setForm] = useState({ renderId: '', platform: 'manual' as Platform, socialAccountId: '', title: '', caption: '', hashtags: '', privacy: 'private', scheduledAt: '' });
  const load = useCallback(async () => {
    const [r, a, p] = await Promise.all([
      apiFetch<{ renders: ClientRender[] }>(`/api/projects/${project.id}/renders`),
      apiFetch<{ accounts: Account[] }>('/api/publishing/accounts'),
      apiFetch<{ publications: Publication[] }>(`/api/publishing/publications?projectId=${project.id}`),
    ]);
    const ok = r.renders.filter((x) => x.status === 'succeeded').reverse();
    setRenders(ok); setAccounts(a.accounts); setPubs(p.publications);
    setForm((f) => ({ ...f, renderId: f.renderId || ok[0]?.id || '' }));
  }, [project.id]);
  useEffect(() => { void load(); const id = setInterval(load, 6000); return () => clearInterval(id); }, [load]);

  const platformAccounts = accounts.filter((a) => a.platform === form.platform);
  const suggest = () => run('cap', async () => {
    const r = await apiFetch<{ title: string; caption: string; hashtags: string[] }>('/api/publishing/caption', { body: { projectId: project.id, platform: form.platform } });
    setForm({ ...form, title: r.title, caption: r.caption, hashtags: r.hashtags.join(' ') });
  });
  const submit = (mode: 'draft' | 'now' | 'schedule') => run(mode, async () => {
    await apiFetch('/api/publishing/publications', {
      body: {
        projectId: project.id, renderId: form.renderId, platform: form.platform, socialAccountId: form.platform === 'manual' ? null : form.socialAccountId || platformAccounts[0]?.id,
        title: form.title, caption: form.caption, hashtags: form.hashtags.split(/\s+/).filter(Boolean), privacy: form.privacy,
        scheduledAt: mode === 'schedule' && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null, submit: mode !== 'draft',
      },
    });
    await load();
  }, t('common.saved'));

  if (!renders.length) return <div className="card space-y-3 p-6 text-sm"><p className="text-mute">{t('export.noRenders')}</p><Link className="btn btn-primary" href={`/projects/${project.id}?stage=export`}>{t('export.render')}</Link></div>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card space-y-4 p-5">
        <h3 className="font-display font-semibold">{t('publish.newPost')}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('publish.render')}>
            <select className="field" value={form.renderId} onChange={(e) => setForm({ ...form, renderId: e.target.value })}>
              {renders.map((r) => <option key={r.id} value={r.id}>{r.width}×{r.height} · {new Date(r.createdAt).toLocaleString()}</option>)}
            </select>
          </Field>
          <Field label={t('publish.platform')}>
            <select className="field" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as Platform, socialAccountId: '' })} data-testid="publish-platform">
              {(['manual', 'youtube', 'tiktok', 'instagram', 'facebook', 'blotato'] as Platform[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          {form.platform !== 'manual' && (
            <Field label={t('publish.account')}>
              <select className="field" value={form.socialAccountId} onChange={(e) => setForm({ ...form, socialAccountId: e.target.value })}>
                {platformAccounts.length === 0 && <option value="">{t('common.notConnected')}</option>}
                {platformAccounts.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('publish.privacy')}>
            <select className="field" value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value })}>
              {(['private', 'unlisted', 'public'] as const).map((p) => <option key={p} value={p}>{t(`publish.privacyOptions.${p}`)}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-mute">{t(`publish.platformNotes.${form.platform}`)}</p>
        <div className="flex justify-end"><button className="btn btn-soft btn-sm" onClick={suggest} disabled={!!busy}>{busy === 'cap' && <Spinner />}✦ {t('publish.generateCaption')}</button></div>
        <Field label={t('publish.titleField')}><input dir="auto" className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('publish.caption')}><textarea dir="auto" className="field h-40" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} data-testid="publish-caption" /></Field>
        <Field label={t('publish.hashtags')}><input dir="auto" className="field" value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} /></Field>
        <Field label={t('publish.scheduleFor')}><input type="datetime-local" className="field" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" disabled={!perms.publish || !!busy} onClick={() => submit('draft')}>{t('publish.saveDraft')}</button>
          <button className="btn btn-ghost" disabled={!perms.publish || !!busy || !form.scheduledAt} onClick={() => submit('schedule')}>{t('publish.schedule')}</button>
          <button className="btn btn-primary" disabled={!perms.publish || !!busy || (form.platform !== 'manual' && platformAccounts.length === 0)} onClick={() => submit('now')} data-testid="publish-now">{t('publish.publishNow')}</button>
        </div>
        {form.platform !== 'manual' && platformAccounts.length === 0 && <Link className="text-xs text-accent-2 hover:underline" href="/publishing">{t('publish.connect')} <span className="inline-block rtl:rotate-180">→</span></Link>}
      </div>
      <div className="card">
        <h3 className="border-b border-line px-5 py-3 font-display font-semibold">{t('publish.queue')}</h3>
        <PublicationList items={pubs} onChanged={load} />
      </div>
    </div>
  );
}
