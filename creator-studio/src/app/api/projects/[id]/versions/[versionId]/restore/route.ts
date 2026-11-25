import { api } from '@/lib/server/api';
import { restoreVersion } from '@/lib/services/projects';

export const POST = api<{ id: string; versionId: string }>(async ({ db, actor, params }) => ({ project: await restoreVersion(db, actor, params.id, params.versionId) }));
