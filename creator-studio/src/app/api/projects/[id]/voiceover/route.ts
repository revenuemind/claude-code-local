import { api } from '@/lib/server/api';
import { requestVoiceover } from '@/lib/services/generation';

export const POST = api<{ id: string }>(async ({ db, actor, params, body }) => ({ job: await requestVoiceover(db, actor, params.id, body) }));
