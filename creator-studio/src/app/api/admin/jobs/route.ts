import { api } from '@/lib/server/api';
import { allJobs } from '@/lib/services/admin';

export const GET = api(async ({ db, actor, req }) => ({ jobs: await allJobs(db, actor, req.nextUrl.searchParams.get('status') ?? undefined) }));
