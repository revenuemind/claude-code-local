'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '../I18nProvider';
import { Empty, PageHeader, StatusBadge } from '../ui';

interface P { id: string; name: string; status: string; type: string; templateId: string | null; updatedAt: string; aspect: string; language: string; mode: string }

export function ProjectList({ projects }: { projects: P[] }) {
  const { t, date } = useI18n();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = projects.filter((p) => (!status || p.status === status) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader title={t('projects.title')} actions={<Link className="btn btn-primary" href="/projects/new">＋ {t('projects.new')}</Link>} />
      <div className="mb-4 flex gap-2">
        <input className="field max-w-sm" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        <select className="field !w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
          <option value="">{t('common.all')}</option>
          {['draft', 'planning', 'generating', 'editing', 'rendering', 'ready', 'published'].map((s) => <option key={s} value={s}>{t(`projects.status.${s}`)}</option>)}
        </select>
      </div>
      {list.length === 0 ? <Empty title={t('projects.none')} action={<Link className="btn btn-primary" href="/templates">{t('dashboard.browseAll')}</Link>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card card-hover flex flex-col gap-3 p-4" data-testid="project-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display font-semibold">{p.name}</div>
                  <div className="text-xs text-mute">{t(`projects.types.${p.type}`)}</div>
                </div>
                <StatusBadge status={p.status} label={t(`projects.status.${p.status}`)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="badge">{p.aspect}</span><span className="badge">{p.language.toUpperCase()}</span><span className="badge">{t(`wizard.modes.${p.mode}`)}</span>
              </div>
              <div className="text-xs text-mute">{t('common.updated')} {date(p.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
