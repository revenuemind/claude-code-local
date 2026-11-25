/** Projects: setup → plan → generation → editing → export. */
import { and, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { projects, projectVersions } from '../db/schema';
import type { Composition } from '../composition/types';
import { parseComposition } from '../composition/schema';
import { draftPlan, buildComposition, estimateRequirements } from '../templates/engine';
import { parsePlan } from '../planning/schema';
import type { ProductionMode, ProductionPlan, SceneMediaMode } from '../planning/types';
import type { ProjectSettings } from '../projects/types';
import { PROJECT_TYPES } from '../projects/types';
import { CONTENT_LANGUAGES } from '../templates/phrases';
import { getTemplate } from './templates';
import { getBrand, toBrandKit } from './brands';
import { getAsset } from './assets';
import { assertCan, badRequest, conflict, notFound, type Actor } from './context';
import { assertCanCreateProject } from './usage';
import { audit } from './audit';
import type { Aspect } from '../templates/types';

export const settingsSchema = z.object({
  language: z.enum(CONTENT_LANGUAGES),
  aspect: z.enum(['9:16', '16:9', '1:1', '4:5']),
  durationSec: z.number().min(5).max(7200),
  style: z.string().max(40).nullable().optional(),
  audience: z.string().max(500).optional(),
  objective: z.string().max(500).optional(),
  platforms: z.array(z.enum(['youtube', 'shorts', 'tiktok', 'instagram', 'facebook'])).max(5).default([]),
  referenceNotes: z.string().max(20_000).optional(),
  sourceUrls: z.array(z.string().url().max(500)).max(10).optional(),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
  captions: z.boolean().optional(),
  voiceover: z.boolean().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(PROJECT_TYPES),
  description: z.string().max(5000).optional(),
  templateId: z.string().max(100),
  brandId: z.string().max(100).nullable().optional(),
  workspaceId: z.string().max(100).nullable().optional(),
  productionMode: z.enum(['code', 'ai', 'hybrid']).default('code'),
  inputs: z.record(z.string().max(60), z.unknown()).default({}),
  settings: settingsSchema,
});

export type ProjectRow = typeof projects.$inferSelect;

export async function getProject(db: DB, actor: Actor, id: string): Promise<ProjectRow> {
  assertCan(actor, 'project.read');
  const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.orgId, actor.orgId))).limit(1);
  if (!p) throw notFound('Project');
  return p;
}

export async function listProjects(db: DB, actor: Actor, filter: { workspaceId?: string; brandId?: string; status?: string } = {}) {
  assertCan(actor, 'project.read');
  const conds = [eq(projects.orgId, actor.orgId)];
  if (filter.workspaceId) conds.push(eq(projects.workspaceId, filter.workspaceId));
  if (filter.brandId) conds.push(eq(projects.brandId, filter.brandId));
  if (filter.status) conds.push(eq(projects.status, filter.status));
  return db.select({
    id: projects.id, name: projects.name, type: projects.type, status: projects.status, templateId: projects.templateId, brandId: projects.brandId,
    workspaceId: projects.workspaceId, productionMode: projects.productionMode, settings: projects.settings, updatedAt: projects.updatedAt, createdAt: projects.createdAt,
  }).from(projects).where(and(...conds)).orderBy(desc(projects.updatedAt)).limit(500);
}

async function brandKitFor(db: DB, orgId: string, brandId: string | null | undefined) {
  if (!brandId) return null;
  return toBrandKit(await getBrand(db, orgId, brandId));
}

export async function createProject(db: DB, actor: Actor, input: unknown) {
  assertCan(actor, 'project.write');
  const data = createProjectSchema.parse(input);
  await assertCanCreateProject(db, actor.orgId);
  const template = await getTemplate(db, actor.orgId, data.templateId);
  if (!template.aspects.includes(data.settings.aspect)) throw badRequest(`Template supports ${template.aspects.join(', ')}`);
  if (!template.modes.includes(data.productionMode)) throw badRequest(`Template supports modes: ${template.modes.join(', ')}`);
  const brand = await brandKitFor(db, actor.orgId, data.brandId);
  const settings = data.settings as ProjectSettings;
  const plan = draftPlan(template, data.inputs, {
    language: settings.language, durationSec: settings.durationSec, mode: data.productionMode,
    audience: settings.audience, objective: settings.objective, captions: settings.captions, voiceover: settings.voiceover,
  });
  const composition = buildComposition(plan, template, { aspect: settings.aspect, brand, styleId: settings.style, fps: settings.fps });
  const [p] = await db.insert(projects).values({
    orgId: actor.orgId, workspaceId: data.workspaceId ?? null, brandId: data.brandId ?? null, name: data.name, type: data.type,
    description: data.description ?? null, templateId: template.id, inputs: data.inputs, settings, productionMode: data.productionMode,
    plan, planSource: 'offline', composition, compositionRevision: 1, status: 'planning', createdBy: actor.userId,
  }).returning();
  await audit(db, actor, 'project.create', { type: 'project', id: p.id }, { template: template.id });
  return p;
}

export async function updateProject(db: DB, actor: Actor, id: string, input: unknown) {
  assertCan(actor, 'project.write');
  const p = await getProject(db, actor, id);
  const data = z.object({
    name: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).nullable().optional(),
    brandId: z.string().max(100).nullable().optional(), workspaceId: z.string().max(100).nullable().optional(),
    productionMode: z.enum(['code', 'ai', 'hybrid']).optional(), inputs: z.record(z.string().max(60), z.unknown()).optional(),
    settings: settingsSchema.partial().optional(), status: z.enum(['draft', 'planning', 'generating', 'editing', 'rendering', 'ready', 'published']).optional(),
  }).parse(input);
  if (data.brandId) await getBrand(db, actor.orgId, data.brandId);
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  for (const k of ['name', 'description', 'brandId', 'workspaceId', 'productionMode', 'inputs', 'status'] as const) if (data[k] !== undefined) (patch as Record<string, unknown>)[k] = data[k];
  if (data.settings) patch.settings = { ...p.settings, ...data.settings } as ProjectSettings;
  const [row] = await db.update(projects).set(patch).where(and(eq(projects.id, id), eq(projects.orgId, actor.orgId))).returning();
  return row;
}

/** Re-draft the plan offline from current inputs/settings (discards plan edits). */
export async function redraftPlan(db: DB, actor: Actor, id: string) {
  const p = await getProject(db, actor, id);
  const t = await getTemplate(db, actor.orgId, p.templateId!);
  const plan = draftPlan(t, p.inputs, { language: p.settings.language, durationSec: p.settings.durationSec, mode: p.productionMode as ProductionMode, audience: p.settings.audience, objective: p.settings.objective, captions: p.settings.captions, voiceover: p.settings.voiceover });
  return savePlan(db, actor, id, plan, 'offline');
}

export async function savePlan(db: DB, actor: Actor, id: string, planInput: unknown, source?: string) {
  assertCan(actor, 'project.write');
  await getProject(db, actor, id);
  const plan = parsePlan(planInput);
  for (const s of plan.scenes) if (s.media) await getAsset(db, actor.orgId, s.media.assetId);
  if (plan.music.assetId) await getAsset(db, actor.orgId, plan.music.assetId);
  plan.requirements = estimateRequirements(plan);
  const patch: Partial<typeof projects.$inferInsert> = { plan, updatedAt: new Date(), planApprovedAt: null };
  if (source) patch.planSource = source;
  const [row] = await db.update(projects).set(patch).where(and(eq(projects.id, id), eq(projects.orgId, actor.orgId))).returning();
  return row;
}

/** Approve the plan and (re)build the timeline from it. The previous timeline is kept as a version. */
export async function approvePlan(db: DB, actor: Actor, id: string) {
  const p = await getProject(db, actor, id);
  if (!p.plan) throw badRequest('Project has no plan');
  const row = await rebuildComposition(db, actor, p, 'Before plan approval');
  const missing = p.plan.requirements.missingAssets.length;
  const [updated] = await db.update(projects).set({ planApprovedAt: new Date(), status: missing ? 'generating' : 'editing', updatedAt: new Date() })
    .where(eq(projects.id, row.id)).returning();
  await audit(db, actor, 'project.plan.approve', { type: 'project', id });
  return updated;
}

export async function compositionFor(db: DB, actor: Actor, p: ProjectRow, aspect?: Aspect, size?: { width: number; height: number }): Promise<Composition> {
  const t = await getTemplate(db, actor.orgId, p.templateId!);
  const brand = await brandKitFor(db, actor.orgId, p.brandId);
  const plan = p.plan as ProductionPlan;
  return buildComposition(plan, t, {
    aspect: aspect ?? p.settings.aspect, width: size?.width, height: size?.height, brand, styleId: p.settings.style, fps: p.settings.fps,
    voice: plan.voiceAssets, musicAssetId: plan.music.assetId ?? null,
  });
}

export async function rebuildComposition(db: DB, actor: Actor, p: ProjectRow, snapshotLabel = 'Before rebuild') {
  assertCan(actor, 'project.write');
  if (!p.plan) throw badRequest('Project has no plan');
  if (p.composition) await saveVersion(db, actor, p.id, snapshotLabel, p.composition);
  const composition = await compositionFor(db, actor, p);
  const [row] = await db.update(projects).set({ composition, compositionRevision: p.compositionRevision + 1, updatedAt: new Date() })
    .where(eq(projects.id, p.id)).returning();
  return row;
}

/** Point a scene's media slot at an asset (or clear it); updates plan and timeline in place. */
export async function assignSceneMedia(db: DB, actor: Actor, id: string, sceneId: string, assetId: string | null) {
  assertCan(actor, 'project.write');
  const p = await getProject(db, actor, id);
  const plan = structuredClone(p.plan) as ProductionPlan;
  const scene = plan.scenes.find((s) => s.id === sceneId);
  if (!scene) throw notFound('Scene');
  let kind: 'image' | 'video' = 'image';
  if (assetId) {
    const a = await getAsset(db, actor.orgId, assetId);
    if (a.kind !== 'image' && a.kind !== 'video') throw badRequest('Only images and videos can fill a scene');
    kind = a.kind;
    scene.media = { assetId, kind };
    if (scene.mediaKind === 'none') scene.mediaKind = kind;
  } else scene.media = null;
  plan.requirements = estimateRequirements(plan);
  let comp = p.composition ? structuredClone(p.composition) : null;
  let rebuilt = false;
  if (comp) {
    const media = comp.tracks.find((t) => t.role === 'media');
    const clip = media?.clips.find((c) => c.sceneId === sceneId && (c.type === 'image' || c.type === 'video'));
    if (clip && assetId && clip.type === kind && 'media' in clip) { clip.media = { assetId }; }
    else if (clip && !assetId && 'media' in clip) { clip.media = {}; }
    else rebuilt = true; // type changed or slot missing: rebuild from plan
  }
  const patch: Partial<typeof projects.$inferInsert> = { plan, updatedAt: new Date() };
  if (comp && !rebuilt) { patch.composition = comp; patch.compositionRevision = p.compositionRevision + 1; }
  let [row] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
  if (rebuilt || !comp) row = await rebuildComposition(db, actor, row, 'Before media change');
  return row;
}

export async function setSceneMediaMode(db: DB, actor: Actor, id: string, sceneId: string, mode: SceneMediaMode) {
  const p = await getProject(db, actor, id);
  const plan = structuredClone(p.plan) as ProductionPlan;
  const s = plan.scenes.find((x) => x.id === sceneId);
  if (!s) throw notFound('Scene');
  s.mediaMode = mode;
  if (mode !== 'code' && s.mediaKind === 'none') s.mediaKind = mode === 'ai-video' ? 'video' : 'image';
  return savePlan(db, actor, id, plan);
}

/** Save an edited timeline with optimistic concurrency (expectedRevision must match). */
export async function saveComposition(db: DB, actor: Actor, id: string, input: unknown, expectedRevision: number) {
  assertCan(actor, 'project.write');
  const p = await getProject(db, actor, id);
  if (p.compositionRevision !== expectedRevision) throw conflict('This timeline was changed elsewhere. Reload to get the latest version.', { currentRevision: p.compositionRevision });
  const comp = parseComposition(input);
  const ids = new Set<string>();
  for (const t of comp.tracks) for (const c of t.clips) if ('media' in c && c.media.assetId) ids.add(c.media.assetId);
  for (const aid of ids) await getAsset(db, actor.orgId, aid); // tenant isolation for referenced media
  const [row] = await db.update(projects).set({ composition: comp, compositionRevision: p.compositionRevision + 1, status: p.status === 'planning' || p.status === 'generating' ? 'editing' : p.status, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.compositionRevision, expectedRevision))).returning();
  if (!row) throw conflict('This timeline was changed elsewhere. Reload to get the latest version.');
  return row;
}

export async function saveVersion(db: DB, actor: Actor, projectId: string, label: string | null, composition?: Composition) {
  assertCan(actor, 'project.write');
  const p = await getProject(db, actor, projectId);
  const comp = composition ?? p.composition;
  if (!comp) throw badRequest('Nothing to save');
  const [{ v }] = await db.select({ v: max(projectVersions.version) }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
  const [row] = await db.insert(projectVersions).values({ projectId, orgId: actor.orgId, version: (v ?? 0) + 1, label: label?.slice(0, 120) ?? null, composition: comp, createdBy: actor.userId }).returning();
  return { id: row.id, version: row.version, label: row.label, createdAt: row.createdAt };
}

export async function listVersions(db: DB, actor: Actor, projectId: string) {
  await getProject(db, actor, projectId);
  return db.select({ id: projectVersions.id, version: projectVersions.version, label: projectVersions.label, createdAt: projectVersions.createdAt })
    .from(projectVersions).where(eq(projectVersions.projectId, projectId)).orderBy(desc(projectVersions.version));
}

export async function restoreVersion(db: DB, actor: Actor, projectId: string, versionId: string) {
  const p = await getProject(db, actor, projectId);
  const [v] = await db.select().from(projectVersions).where(and(eq(projectVersions.id, versionId), eq(projectVersions.projectId, projectId))).limit(1);
  if (!v) throw notFound('Version');
  if (p.composition) await saveVersion(db, actor, projectId, 'Before restore', p.composition);
  const [row] = await db.update(projects).set({ composition: v.composition, compositionRevision: p.compositionRevision + 1, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
  return row;
}

export async function duplicateProject(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'project.write');
  await assertCanCreateProject(db, actor.orgId);
  const p = await getProject(db, actor, id);
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p;
  const [row] = await db.insert(projects).values({ ...rest, name: `${p.name} (copy)`, status: 'editing', createdBy: actor.userId }).returning();
  await audit(db, actor, 'project.duplicate', { type: 'project', id: row.id }, { from: id });
  return row;
}

export async function deleteProject(db: DB, actor: Actor, id: string) {
  assertCan(actor, 'project.delete');
  await getProject(db, actor, id);
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.orgId, actor.orgId)));
  await audit(db, actor, 'project.delete', { type: 'project', id });
}
