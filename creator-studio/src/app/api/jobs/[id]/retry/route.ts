import { api } from '@/lib/server/api';
import { retryJob } from '@/lib/jobs/queue';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ job: await retryJob(db, actor, params.id) }));
