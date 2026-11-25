import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/server/session';
import { listProjects } from '@/lib/services/projects';
import { usageSummary } from '@/lib/services/usage';
import { listJobs } from '@/lib/jobs/queue';
import { TEMPLATES } from '@/lib/templates/library';
import { Dashboard } from '@/components/pages/Dashboard';

export default async function DashboardPage() {
  const actor = await requireActor();
  const db = await getDb();
  const [projects, usage, jobs] = await Promise.all([listProjects(db, actor), usageSummary(db, actor.orgId), listJobs(db, actor, { limit: 12 })]);
  const featured = ['viral-hook', 'top-5-countdown', 'product-commercial', 'documentary', 'ai-influencer-talking', 'myth-vs-reality'].map((id) => TEMPLATES.find((t) => t.id === id)!).filter(Boolean);
  return (
    <Dashboard
      name={actor.name}
      projects={projects.slice(0, 8).map((p) => ({ id: p.id, name: p.name, status: p.status, type: p.type, updatedAt: p.updatedAt.toISOString(), aspect: p.settings.aspect, language: p.settings.language }))}
      stats={{ projects: usage.projects, renderMinutes: usage.renderMinutes, aiCost: usage.aiCostUsd, plan: usage.plan.name }}
      jobs={jobs.map((j) => ({ id: j.id, type: j.type, status: j.status, progress: j.progress, projectId: j.projectId, createdAt: j.createdAt.toISOString(), error: j.error }))}
      featured={featured}
    />
  );
}
