import { api } from '@/lib/server/api';
import { submitPublication } from '@/lib/services/publishing';

export const POST = api<{ id: string }>(async ({ db, actor, params }) => ({ job: await submitPublication(db, actor, params.id) }));
