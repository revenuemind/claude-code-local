import { api } from '@/lib/server/api';
import { z } from 'zod';
import { listVersions, saveVersion } from '@/lib/services/projects';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => ({ versions: await listVersions(db, actor, params.id) }));
export const POST = api<P>(async ({ db, actor, params, body }) => ({ version: await saveVersion(db, actor, params.id, z.object({ label: z.string().max(120).nullable().optional() }).parse(body ?? {}).label ?? null) }));
