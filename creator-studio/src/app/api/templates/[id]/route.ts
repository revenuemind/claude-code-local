import { api } from '@/lib/server/api';
import { getTemplate, updateCustomTemplate, deleteCustomTemplate } from '@/lib/services/templates';

type P = { id: string };
export const GET = api<P>(async ({ db, actor, params }) => ({ template: await getTemplate(db, actor.orgId, params.id) }));
export const PATCH = api<P>(async ({ db, actor, params, body }) => ({ template: await updateCustomTemplate(db, actor, params.id, body as never) }));
export const DELETE = api<P>(async ({ db, actor, params }) => { await deleteCustomTemplate(db, actor, params.id); return { ok: true }; });
