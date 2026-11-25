import { api } from '@/lib/server/api';
import { listJobs } from '@/lib/jobs/queue';

export const GET = api(async ({ db, actor, req }) => {
  const sp = req.nextUrl.searchParams;
  return { jobs: await listJobs(db, actor, { projectId: sp.get('projectId') ?? undefined, status: sp.get('status') ?? undefined, limit: Number(sp.get('limit') ?? 100) }) };
});
