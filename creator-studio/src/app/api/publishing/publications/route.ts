import { api } from '@/lib/server/api';
import { listPublications, createPublication } from '@/lib/services/publishing';

export const GET = api(async ({ db, actor, req }) => ({ publications: await listPublications(db, actor, req.nextUrl.searchParams.get('projectId') ?? undefined) }));
export const POST = api(async ({ db, actor, body }) => {
  const b = body as Record<string, unknown>;
  return { publication: await createPublication(db, actor, b, { submit: b.submit === true }) };
});
