/** Idempotent baseline data: subscription plans (limits are data, editable by admins). */
import { sql } from 'drizzle-orm';
import type { DB } from './client';
import { plans } from './schema';
import type { PlanLimits } from '../billing/types';

export const DEFAULT_PLANS: Array<{ id: string; name: string; limits: PlanLimits; features: string[]; sortOrder: number }> = [
  { id: 'free', name: 'Free', sortOrder: 0, features: ['templates', 'code-mode'], limits: { seats: 1, projects: 5, renderMinutesPerMonth: 10, maxRenderHeight: 1080, storageMb: 1024, aiCreditsUsdPerMonth: 0, scheduledPosts: 0, customTemplates: 2, watermark: true } },
  { id: 'creator', name: 'Creator', sortOrder: 1, features: ['templates', 'code-mode', 'ai-mode', 'hybrid-mode', 'publishing'], limits: { seats: 2, projects: 100, renderMinutesPerMonth: 300, maxRenderHeight: 2160, storageMb: 50_000, aiCreditsUsdPerMonth: 25, scheduledPosts: 200, customTemplates: 50, watermark: false } },
  { id: 'agency', name: 'Agency', sortOrder: 2, features: ['templates', 'code-mode', 'ai-mode', 'hybrid-mode', 'publishing', 'workspaces', 'brand-kits', 'template-editor'], limits: { seats: 25, projects: -1, renderMinutesPerMonth: 3000, maxRenderHeight: 2160, storageMb: 500_000, aiCreditsUsdPerMonth: 250, scheduledPosts: -1, customTemplates: -1, watermark: false } },
];

export async function ensureSeed(db: DB): Promise<void> {
  for (const p of DEFAULT_PLANS) {
    await db.insert(plans).values({ ...p, active: true }).onConflictDoNothing({ target: plans.id });
  }
  await db.execute(sql`select 1`);
}
