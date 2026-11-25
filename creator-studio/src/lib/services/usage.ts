/** Usage metering and plan limits (limits are data in the `plans` table). */
import { and, count, eq, gte, sql, sum } from 'drizzle-orm';
import type { DB } from '../db/client';
import { plans, projects, subscriptions, usageEvents, customTemplates } from '../db/schema';
import type { PlanLimits, UsageKind } from '../billing/types';
import { DEFAULT_PLANS } from '../db/seed';
import { limitReached } from './context';

export async function getOrgPlan(db: DB, orgId: string): Promise<{ id: string; name: string; limits: PlanLimits; features: string[]; periodStart: Date }> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
  const planId = sub?.planId ?? 'free';
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const fallback = DEFAULT_PLANS[0];
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = sub?.currentPeriodStart && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodStart : monthStart;
  return { id: plan?.id ?? fallback.id, name: plan?.name ?? fallback.name, limits: plan?.limits ?? fallback.limits, features: plan?.features ?? fallback.features, periodStart };
}

export async function recordUsage(db: DB, e: { orgId: string; userId?: string | null; kind: UsageKind; quantity: number; providerId?: string | null; estimatedCostUsd?: number | null; jobId?: string | null }) {
  await db.insert(usageEvents).values({ ...e, userId: e.userId ?? null, providerId: e.providerId ?? null, estimatedCostUsd: e.estimatedCostUsd ?? null, jobId: e.jobId ?? null });
}

export async function usageSince(db: DB, orgId: string, since: Date) {
  const rows = await db.select({ kind: usageEvents.kind, qty: sum(usageEvents.quantity), cost: sum(usageEvents.estimatedCostUsd), n: count() })
    .from(usageEvents).where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.createdAt, since))).groupBy(usageEvents.kind);
  const out: Record<string, { quantity: number; costUsd: number; events: number }> = {};
  for (const r of rows) out[r.kind] = { quantity: Number(r.qty ?? 0), costUsd: Number(r.cost ?? 0), events: Number(r.n) };
  return out;
}

export async function usageSummary(db: DB, orgId: string) {
  const plan = await getOrgPlan(db, orgId);
  const usage = await usageSince(db, orgId, plan.periodStart);
  const aiCost = Object.entries(usage).filter(([k]) => k.startsWith('ai.')).reduce((s, [, v]) => s + v.costUsd, 0);
  const [{ value: projectCount }] = await db.select({ value: count() }).from(projects).where(eq(projects.orgId, orgId));
  return {
    plan,
    usage,
    renderMinutes: (usage['render.seconds']?.quantity ?? 0) / 60,
    aiCostUsd: aiCost,
    projects: Number(projectCount),
  };
}

const unlimited = (n: number) => n < 0;

export async function assertCanRender(db: DB, orgId: string, seconds: number, height: number) {
  const s = await usageSummary(db, orgId);
  const l = s.plan.limits;
  if (!unlimited(l.maxRenderHeight) && height > l.maxRenderHeight) throw limitReached(`Your plan allows exports up to ${l.maxRenderHeight}p.`);
  if (!unlimited(l.renderMinutesPerMonth) && s.renderMinutes + seconds / 60 > l.renderMinutesPerMonth) {
    throw limitReached(`Render limit reached: ${s.renderMinutes.toFixed(1)} of ${l.renderMinutesPerMonth} minutes used this period.`);
  }
  return s;
}

export async function assertAiBudget(db: DB, orgId: string, estimatedUsd: number | null, usingPlatformCredentials: boolean) {
  // Org-owned API keys are billed by the provider directly; plan AI credits only cover platform-managed keys.
  if (!usingPlatformCredentials) return;
  const s = await usageSummary(db, orgId);
  const budget = s.plan.limits.aiCreditsUsdPerMonth;
  if (unlimited(budget)) return;
  if (s.aiCostUsd + (estimatedUsd ?? 0) > budget) throw limitReached(`Platform AI credit limit reached ($${s.aiCostUsd.toFixed(2)} of $${budget}). Connect your own API key or upgrade.`);
}

export async function assertCanCreateProject(db: DB, orgId: string) {
  const s = await usageSummary(db, orgId);
  if (!unlimited(s.plan.limits.projects) && s.projects >= s.plan.limits.projects) throw limitReached(`Your plan allows ${s.plan.limits.projects} projects.`);
}

export async function assertCanCreateTemplate(db: DB, orgId: string) {
  const plan = await getOrgPlan(db, orgId);
  if (unlimited(plan.limits.customTemplates)) return;
  const [{ value }] = await db.select({ value: count() }).from(customTemplates).where(eq(customTemplates.orgId, orgId));
  if (Number(value) >= plan.limits.customTemplates) throw limitReached(`Your plan allows ${plan.limits.customTemplates} custom templates.`);
}

export async function platformUsage(db: DB) {
  return db.select({ orgId: usageEvents.orgId, kind: usageEvents.kind, qty: sql<number>`sum(${usageEvents.quantity})`, cost: sql<number>`coalesce(sum(${usageEvents.estimatedCostUsd}),0)` })
    .from(usageEvents).groupBy(usageEvents.orgId, usageEvents.kind);
}
