/** Accounts, organizations and sessions. */
import { and, count, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { users, organizations, memberships, sessions, workspaces, subscriptions } from '../db/schema';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../security/crypto';
import { AppError, badRequest, forbidden, type Actor } from './context';
import { isRole, type Role } from '../auth/rbac';
import { audit } from './audit';

export const SESSION_COOKIE = 'cs_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const UI_LOCALES = ['en', 'he', 'ru', 'ar', 'am'] as const;

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  orgName: z.string().trim().min(1).max(100).optional(),
  uiLocale: z.enum(UI_LOCALES).optional(),
});

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'org';
}

async function uniqueSlug(db: DB, base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i++) {
    const [hit] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!hit) return slug;
    slug = `${slugify(base)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  }
  throw new AppError(500, 'slug', 'could not allocate organization slug');
}

export async function createOrganization(db: DB, ownerId: string, name: string, planId = process.env.DEFAULT_PLAN_ID || 'free') {
  const slug = await uniqueSlug(db, name);
  const [org] = await db.insert(organizations).values({ name, slug, planId }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: ownerId, role: 'owner' });
  await db.insert(workspaces).values({ orgId: org.id, name: 'Main' });
  await db.insert(subscriptions).values({ orgId: org.id, planId, status: 'active' }).onConflictDoNothing();
  return org;
}

export async function register(db: DB, input: z.infer<typeof registerSchema>, ip?: string | null) {
  const data = registerSchema.parse(input);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) throw new AppError(409, 'email_taken', 'An account with this email already exists');
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isPlatformAdmin = adminEmails.includes(data.email) || (userCount === 0 && process.env.FIRST_USER_IS_ADMIN !== 'false');
  const [user] = await db.insert(users).values({
    email: data.email, name: data.name, passwordHash: await hashPassword(data.password), uiLocale: data.uiLocale ?? 'en', isPlatformAdmin,
  }).returning();
  const org = await createOrganization(db, user.id, data.orgName || `${data.name}'s Studio`);
  await audit(db, { orgId: org.id, userId: user.id, ip }, 'user.register', { type: 'user', id: user.id });
  return { user, org };
}

export async function login(db: DB, input: z.infer<typeof loginSchema>, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const data = loginSchema.parse(input);
  const [user] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  // Always run a hash comparison to keep timing uniform for unknown emails.
  const ok = user ? await verifyPassword(data.password, user.passwordHash) : await verifyPassword(data.password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  if (user.disabled) throw forbidden('This account is disabled');
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
  const token = await createSession(db, user.id, m?.orgId ?? null, meta);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(db, { orgId: m?.orgId ?? null as unknown as string, userId: user.id, ip: meta.ip }, 'user.login', { type: 'user', id: user.id });
  return { token, user };
}

export async function createSession(db: DB, userId: string, orgId: string | null, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<string> {
  const token = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: sha256(token), userId, activeOrgId: orgId, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return token;
}

export async function resolveSession(db: DB, token: string | undefined | null): Promise<Actor | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!row || row.u.disabled) return null;
  let orgId = row.s.activeOrgId;
  let m = orgId ? (await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, row.u.id))).limit(1))[0] : undefined;
  if (!m) {
    m = (await db.select().from(memberships).where(eq(memberships.userId, row.u.id)).limit(1))[0];
    orgId = m?.orgId ?? null;
  }
  if (!m || !orgId) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return {
    userId: row.u.id, email: row.u.email, name: row.u.name, orgId, orgName: org?.name ?? '', role: isRole(m.role) ? m.role : 'viewer',
    isPlatformAdmin: row.u.isPlatformAdmin, uiLocale: row.u.uiLocale, sessionId: row.s.id,
  };
}

export async function logout(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function switchOrg(db: DB, actor: Actor, orgId: string) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, actor.userId))).limit(1);
  if (!m) throw forbidden('Not a member of that organization');
  if (actor.sessionId) await db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, actor.sessionId));
}

export async function listMyOrgs(db: DB, userId: string) {
  return db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: memberships.role })
    .from(memberships).innerJoin(organizations, eq(organizations.id, memberships.orgId)).where(eq(memberships.userId, userId));
}

export async function updateProfile(db: DB, actor: Actor, patch: { name?: string; uiLocale?: string }) {
  const p = z.object({ name: z.string().trim().min(1).max(100).optional(), uiLocale: z.enum(UI_LOCALES).optional() }).parse(patch);
  await db.update(users).set(p).where(eq(users.id, actor.userId));
}

// ───────────────────────── Members ─────────────────────────

export async function listMembers(db: DB, orgId: string) {
  return db.select({ id: memberships.id, userId: users.id, name: users.name, email: users.email, role: memberships.role, createdAt: memberships.createdAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, orgId));
}

export async function addMember(db: DB, actor: Actor, email: string, role: Role) {
  if (role === 'owner' && actor.role !== 'owner') throw forbidden('Only owners can add owners');
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  if (!u) throw badRequest('No account exists for that email. Ask them to sign up first, then add them.');
  await db.insert(memberships).values({ orgId: actor.orgId, userId: u.id, role }).onConflictDoNothing();
  await audit(db, actor, 'member.add', { type: 'user', id: u.id }, { role });
}

export async function setMemberRole(db: DB, actor: Actor, userId: string, role: Role) {
  if ((role === 'owner' || userId === actor.userId) && actor.role !== 'owner') throw forbidden('Only owners can change owner roles or their own role');
  const owners = (await listMembers(db, actor.orgId)).filter((m) => m.role === 'owner');
  if (owners.length === 1 && owners[0].userId === userId && role !== 'owner') throw badRequest('An organization needs at least one owner');
  await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId)));
  await audit(db, actor, 'member.role', { type: 'user', id: userId }, { role });
}

export async function removeMember(db: DB, actor: Actor, userId: string) {
  const owners = (await listMembers(db, actor.orgId)).filter((m) => m.role === 'owner');
  if (owners.length === 1 && owners[0].userId === userId) throw badRequest('Cannot remove the last owner');
  await db.delete(memberships).where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId)));
  await audit(db, actor, 'member.remove', { type: 'user', id: userId });
}
