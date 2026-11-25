/** Template library: built-in (code) templates + org/platform custom templates (database). */
import { and, eq, isNull, or } from 'drizzle-orm';
import type { DB } from '../db/client';
import { customTemplates } from '../db/schema';
import { TEMPLATES, getBuiltinTemplate } from '../templates/library';
import { parseTemplate } from '../templates/schema';
import type { TemplateDefinition } from '../templates/types';
import { assertCan, badRequest, forbidden, notFound, type Actor } from './context';
import { audit } from './audit';

function fromRow(row: typeof customTemplates.$inferSelect): TemplateDefinition {
  return { ...row.definition, id: row.id, custom: { orgId: row.orgId, baseTemplateId: row.baseTemplateId ?? undefined, status: row.status, visibility: row.visibility } };
}

export async function listTemplates(db: DB, actor: Actor): Promise<TemplateDefinition[]> {
  const rows = await db.select().from(customTemplates).where(
    and(or(eq(customTemplates.orgId, actor.orgId), and(isNull(customTemplates.orgId), eq(customTemplates.visibility, 'platform'))), eq(customTemplates.status, 'published')),
  );
  const drafts = await db.select().from(customTemplates).where(and(eq(customTemplates.orgId, actor.orgId), eq(customTemplates.status, 'draft')));
  return [...TEMPLATES, ...rows.map(fromRow), ...drafts.map(fromRow)];
}

export async function getTemplate(db: DB, orgId: string, id: string): Promise<TemplateDefinition> {
  const builtin = getBuiltinTemplate(id);
  if (builtin) return builtin;
  const [row] = await db.select().from(customTemplates).where(eq(customTemplates.id, id)).limit(1);
  if (!row || (row.orgId && row.orgId !== orgId) || (!row.orgId && row.visibility !== 'platform')) throw notFound('Template');
  return fromRow(row);
}

/** Create a custom template from a definition, or duplicate an existing template. */
export async function saveCustomTemplate(db: DB, actor: Actor, input: { definition: unknown; baseTemplateId?: string; status?: 'draft' | 'published'; platform?: boolean }) {
  assertCan(actor, 'template.write');
  if (input.platform && !actor.isPlatformAdmin) throw forbidden('Only platform admins can publish platform-wide templates');
  const def = parseTemplate(input.definition);
  const id = `c-${crypto.randomUUID().slice(0, 12)}`;
  const [row] = await db.insert(customTemplates).values({
    id, orgId: input.platform ? null : actor.orgId, baseTemplateId: input.baseTemplateId ?? null,
    definition: { ...def, id }, status: input.status ?? 'published', visibility: input.platform ? 'platform' : 'org', createdBy: actor.userId,
  }).returning();
  await audit(db, actor, 'template.create', { type: 'template', id }, { base: input.baseTemplateId });
  return fromRow(row);
}

export async function duplicateTemplate(db: DB, actor: Actor, sourceId: string, nameSuffix = ' (copy)') {
  const src = await getTemplate(db, actor.orgId, sourceId);
  const def: TemplateDefinition = structuredClone({ ...src, custom: undefined });
  def.name = Object.fromEntries(Object.entries(def.name).map(([k, v]) => [k, `${v}${nameSuffix}`])) as TemplateDefinition['name'];
  def.id = 'copy';
  return saveCustomTemplate(db, actor, { definition: def, baseTemplateId: sourceId, status: 'draft' });
}

export async function updateCustomTemplate(db: DB, actor: Actor, id: string, input: { definition?: unknown; status?: 'draft' | 'published' | 'archived' }) {
  assertCan(actor, 'template.write');
  const [row] = await db.select().from(customTemplates).where(eq(customTemplates.id, id)).limit(1);
  if (!row) throw notFound('Template');
  if (row.orgId !== actor.orgId && !(row.orgId === null && actor.isPlatformAdmin)) throw forbidden('You cannot edit this template');
  const patch: Partial<typeof customTemplates.$inferInsert> = { updatedAt: new Date() };
  if (input.definition !== undefined) {
    const def = parseTemplate({ ...(input.definition as object), id });
    patch.definition = { ...def, version: (row.definition.version ?? 1) + 1, id };
  }
  if (input.status) patch.status = input.status;
  await db.update(customTemplates).set(patch).where(eq(customTemplates.id, id));
  await audit(db, actor, 'template.update', { type: 'template', id });
  return getTemplate(db, actor.orgId, id);
}

export async function deleteCustomTemplate(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'template.write');
  if (getBuiltinTemplate(id)) throw badRequest('Built-in templates cannot be deleted');
  const [row] = await db.select().from(customTemplates).where(eq(customTemplates.id, id)).limit(1);
  if (!row) throw notFound('Template');
  if (row.orgId !== actor.orgId && !(row.orgId === null && actor.isPlatformAdmin)) throw forbidden('You cannot delete this template');
  await db.delete(customTemplates).where(eq(customTemplates.id, id));
  await audit(db, actor, 'template.delete', { type: 'template', id });
}

/** Portable JSON export (drops tenant-specific metadata). */
export function exportTemplate(t: TemplateDefinition): string {
  const { custom: _custom, ...rest } = t;
  return JSON.stringify({ format: 'ai-creator-studio/template', formatVersion: 1, template: rest }, null, 2);
}

export async function importTemplate(db: DB, actor: Actor, json: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw badRequest('Not valid JSON'); }
  const p = parsed as { format?: string; template?: unknown };
  const def = p?.format === 'ai-creator-studio/template' ? p.template : parsed;
  return saveCustomTemplate(db, actor, { definition: def, status: 'draft' });
}
