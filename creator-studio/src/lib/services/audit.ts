import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { auditLogs } from '../db/schema';
import type { Actor } from './context';

export async function audit(db: DB, actor: Pick<Actor, 'orgId' | 'userId' | 'ip'> | null, action: string, target?: { type: string; id: string }, meta: Record<string, unknown> = {}) {
  await db.insert(auditLogs).values({
    orgId: actor?.orgId ?? null, userId: actor?.userId ?? null, action,
    targetType: target?.type ?? null, targetId: target?.id ?? null, meta, ip: actor?.ip ?? null,
  });
}

export async function listAudit(db: DB, orgId: string | null, limit = 100) {
  const q = db.select().from(auditLogs);
  return (orgId ? q.where(eq(auditLogs.orgId, orgId)) : q).orderBy(desc(auditLogs.createdAt)).limit(Math.min(500, limit));
}
