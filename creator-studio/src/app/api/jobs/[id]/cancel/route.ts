import { api } from '@/lib/server/api';
import { cancelJob } from '@/lib/jobs/queue';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => { await cancelJob(db, actor, params.id); return { ok: true }; });
