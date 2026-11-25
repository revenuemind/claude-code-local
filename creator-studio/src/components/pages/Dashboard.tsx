'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { TemplateDefinition } from '@/lib/templates/types';
import { useI18n } from '../I18nProvider';
import { Empty, PageHeader, Progress, StatusBadge } from '../ui';
import { TemplateDetail, localized } from '../templates/TemplateLibrary';

interface P { id: string; name: string; status: string; type: string; updatedAt: string; aspect: string; language: string }
interface J { id: string; type: string; status: string; progress: number; projectId: string | null; createdAt: string; error: string | null }

export function Dashboard({ name, projects, stats, jobs, featured }: { name: string; projects: P[]; stats: { projects: number; renderMinutes: number; aiCost: number; plan: string }; jobs: J[]; featured: TemplateDefinition[] }) {
  const { t, date, num, usd, locale } = useI18n();
  const [open, setOpen] = useState<TemplateDefinition | null>(null);
  const cards = [
    { label: t('dashboard.stats.projects'), value: num(stats.projects) },
    { label: t('dashboard.stats.renders'), value: num(stats.renderMinutes, { maximumFractionDigits: 1 }) },
    { label: t('dashboard.stats.aiSpend'), value: usd(stats.aiCost) },
    { label: t('dashboard.stats.plan'), value: stats.plan },
  ];
  return (
    <div className="space-y-8">
      <PageHeader title={t('dashboard.greeting', { name: name.split(' ')[0] })} subtitle={t('dashboard.subtitle')} actions={<Link className="btn btn-primary" href="/projects/new">＋ {t('nav.newProject')}</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs text-mute">{c.label}</div>
            <div className="mt-1 font-display text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{t('dashboard.quickStart')}</h2>
          <Link className="text-sm font-semibold text-accent-2 hover:underline" href="/templates">{t('dashboard.browseAll')} <span className="inline-block rtl:rotate-180">→</span></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {featured.map((f) => (
            <button key={f.id} onClick={() => setOpen(f)} className="card card-hover p-4 text-start">
              <div className="mb-2 text-xs text-accent-2">{t(`templates.categories.${f.category}`)}</div>
              <div className="font-display text-sm font-semibold">{localized(f.name, locale)}</div>
              <div className="mt-1 line-clamp-2 text-xs text-mute">{localized(f.description, locale)}</div>
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">{t('dashboard.recent')}</h2>
          {projects.length === 0 ? <Empty title={t('dashboard.noProjects')} action={<Link className="btn btn-primary" href="/templates">{t('dashboard.browseAll')}</Link>} /> : (
            <div className="card divide-y divide-line">
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-panel-2">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-panel-3 font-mono text-[10px] text-ink-2">{p.aspect}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-mute">{t(`projects.types.${p.type}`)} · {p.language.toUpperCase()} · {date(p.updatedAt)}</div>
                  </div>
                  <StatusBadge status={p.status} label={t(`projects.status.${p.status}`)} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">{t('dashboard.activity')}</h2>
          {jobs.length === 0 ? <div className="card p-6 text-sm text-mute">{t('generate.noJobs')}</div> : (
            <div className="card divide-y divide-line">
              {jobs.map((j) => (
                <div key={j.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{t(`generate.jobTypes.${j.type}`)}</span>
                    <StatusBadge status={j.status} label={t(`generate.jobStatus.${j.status}`)} />
                  </div>
                  {j.status === 'running' && <Progress value={j.progress} />}
                  {j.error && j.status !== 'succeeded' && <div className="line-clamp-2 text-xs text-bad">{j.error}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {open && <TemplateDetail t={open} onClose={() => setOpen(null)} onChanged={() => {}} />}
    </div>
  );
}
