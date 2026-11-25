'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { TemplateDefinition } from '@/lib/templates/types';
import type { ClientJob, ClientProject } from '@/lib/client/types';
import { apiFetch } from '@/lib/client/api';
import { useI18n } from '../I18nProvider';
import { PageHeader, StatusBadge, Tabs, useAction } from '../ui';
import { Overview } from './Overview';
import { PlanStage } from './PlanStage';
import { GenerateStage } from './GenerateStage';
import { Editor } from './editor/Editor';
import { ExportStage } from './ExportStage';
import { PublishStage } from './PublishStage';
import { localized } from '../templates/TemplateLibrary';

export type Stage = 'overview' | 'plan' | 'generate' | 'editor' | 'export' | 'publish';
const STAGES: Stage[] = ['overview', 'plan', 'generate', 'editor', 'export', 'publish'];

interface Perms { write: boolean; generate: boolean; render: boolean; publish: boolean; del: boolean }
interface Ctx {
  project: ClientProject; setProject: (p: ClientProject) => void; reload: () => Promise<void>;
  template: TemplateDefinition | null; jobs: ClientJob[]; refreshJobs: () => Promise<void>; perms: Perms; go: (s: Stage) => void;
}
const ProjectCtx = createContext<Ctx | null>(null);
export const useProject = () => { const c = useContext(ProjectCtx); if (!c) throw new Error('useProject outside workspace'); return c; };

export function ProjectWorkspace({ initial, template, stage: initialStage, perms }: { initial: ClientProject; template: TemplateDefinition | null; stage: string; perms: Perms }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [project, setProject] = useState(initial);
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const stage = (STAGES.includes((sp.get('stage') ?? initialStage) as Stage) ? (sp.get('stage') ?? initialStage) : 'overview') as Stage;
  const { run } = useAction();

  const reload = useCallback(async () => {
    const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}`);
    setProject(r.project);
  }, [project.id]);

  const prevActive = useRef(0);
  const refreshJobs = useCallback(async () => {
    const r = await apiFetch<{ jobs: ClientJob[] }>(`/api/jobs?projectId=${project.id}&limit=100`);
    setJobs(r.jobs);
    const active = r.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
    if (active < prevActive.current) await reload(); // something finished → pick up new plan/media/timeline
    prevActive.current = active;
  }, [project.id, reload]);

  useEffect(() => { void refreshJobs(); }, [refreshJobs]);
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
    const id = setInterval(() => { void refreshJobs(); }, active ? 1500 : 8000);
    return () => clearInterval(id);
  }, [jobs, refreshJobs]);

  const go = useCallback((s: Stage) => router.replace(`/projects/${project.id}?stage=${s}`, { scroll: false }), [router, project.id]);

  const rename = () => run('rename', async () => {
    const name = prompt(t('common.name'), project.name);
    if (!name?.trim()) return;
    const r = await apiFetch<{ project: ClientProject }>(`/api/projects/${project.id}`, { method: 'PATCH', body: { name } });
    setProject(r.project);
  });

  return (
    <ProjectCtx.Provider value={{ project, setProject, reload, template, jobs, refreshJobs, perms, go }}>
      <div className={stage === 'editor' ? '-mx-4 -my-6 md:-mx-8 md:-my-8' : ''}>
        {stage !== 'editor' && (
          <PageHeader
            title={<button onClick={rename} className="text-start hover:text-accent-2" disabled={!perms.write}>{project.name}</button>}
            subtitle={<span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={project.status} label={t(`projects.status.${project.status}`)} />
              {template && <span>{localized(template.name, locale)}</span>}
              <span>· {project.settings.aspect} · {project.settings.language.toUpperCase()} · {t(`wizard.modes.${project.productionMode}`)}</span>
            </span>}
          />
        )}
        <div className={stage === 'editor' ? 'border-b border-line bg-panel px-4 py-2' : 'mb-6'}>
          <Tabs value={stage} onChange={go} items={STAGES.map((s, i) => ({ value: s, label: <span><span className="me-1.5 text-mute">{i + 1}</span>{t(`projects.stages.${s}`)}</span> }))} />
        </div>
        {stage === 'overview' && <Overview />}
        {stage === 'plan' && <PlanStage />}
        {stage === 'generate' && <GenerateStage />}
        {stage === 'editor' && <Editor />}
        {stage === 'export' && <ExportStage />}
        {stage === 'publish' && <PublishStage />}
      </div>
    </ProjectCtx.Provider>
  );
}
