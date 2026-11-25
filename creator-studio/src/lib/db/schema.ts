/**
 * Database schema (PostgreSQL). Every tenant-owned row carries `orgId`; all
 * data access goes through services that scope queries by the caller's org.
 */
import {
  pgTable, text, timestamp, integer, boolean, jsonb, real, uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Identity & tenancy ─────────────────────────

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  uiLocale: text('ui_locale').notNull().default('en'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  disabled: boolean('disabled').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  planId: text('plan_id'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('orgs_slug_uq').on(t.slug)]);

export const memberships = pgTable('memberships', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // owner | admin | editor | viewer
  createdAt: createdAt(),
}, (t) => [uniqueIndex('memberships_org_user_uq').on(t.orgId, t.userId)]);

export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeOrgId: text('active_org_id').references(() => organizations.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash)]);

export const workspaces = pgTable('workspaces', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: createdAt(),
}, (t) => [index('workspaces_org_idx').on(t.orgId)]);

// ───────────────────────── Brands ─────────────────────────

export const brands = pgTable('brands', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  logoAssetId: text('logo_asset_id'),
  colors: jsonb('colors').$type<import('../brand/types').BrandColors>().notNull(),
  fonts: jsonb('fonts').$type<import('../brand/types').BrandFonts>().notNull(),
  voice: text('voice'),
  preferredLanguages: jsonb('preferred_languages').$type<string[]>().notNull().default([]),
  socialAccounts: jsonb('social_accounts').$type<Record<string, string>>().notNull().default({}),
  referenceAssetIds: jsonb('reference_asset_ids').$type<string[]>().notNull().default([]),
  guidelines: text('guidelines'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('brands_org_idx').on(t.orgId)]);

// ───────────────────────── Projects ─────────────────────────

export const projects = pgTable('projects', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'),
  templateId: text('template_id'),
  inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull().default({}),
  settings: jsonb('settings').$type<import('../projects/types').ProjectSettings>().notNull(),
  productionMode: text('production_mode').notNull().default('code'), // code | ai | hybrid
  plan: jsonb('plan').$type<import('../planning/types').ProductionPlan | null>(),
  planSource: text('plan_source'), // offline | provider id
  planApprovedAt: timestamp('plan_approved_at', { withTimezone: true }),
  composition: jsonb('composition').$type<import('../composition/types').Composition | null>(),
  compositionRevision: integer('composition_revision').notNull().default(0),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('projects_org_idx').on(t.orgId), index('projects_ws_idx').on(t.workspaceId)]);

export const projectVersions = pgTable('project_versions', {
  id: id(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull(),
  version: integer('version').notNull(),
  label: text('label'),
  composition: jsonb('composition').$type<import('../composition/types').Composition>().notNull(),
  createdBy: text('created_by'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('project_versions_uq').on(t.projectId, t.version)]);

// ───────────────────────── Assets & storage ─────────────────────────

export const assets = pgTable('assets', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(), // image | video | audio | subtitle | render | thumbnail | document
  name: text('name').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  source: text('source').notNull(), // upload | generated | render | procedural
  providerId: text('provider_id'),
  modelId: text('model_id'),
  prompt: text('prompt'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by'),
  createdAt: createdAt(),
}, (t) => [index('assets_org_idx').on(t.orgId), index('assets_project_idx').on(t.projectId)]);

// ───────────────────────── Templates (custom / user-made) ─────────────────────────

export const customTemplates = pgTable('custom_templates', {
  id: id(),
  orgId: text('org_id').references(() => organizations.id, { onDelete: 'cascade' }), // null = platform-wide
  baseTemplateId: text('base_template_id'),
  definition: jsonb('definition').$type<import('../templates/types').TemplateDefinition>().notNull(),
  visibility: text('visibility').notNull().default('org'), // private | org | platform | marketplace
  status: text('status').notNull().default('published'), // draft | published | archived
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('custom_templates_org_idx').on(t.orgId)]);

// ───────────────────────── AI engines ─────────────────────────

export const providerCredentials = pgTable('provider_credentials', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  label: text('label').notNull().default('default'),
  encryptedSecret: text('encrypted_secret').notNull(),
  keyHint: text('key_hint').notNull(),
  config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
  createdBy: text('created_by'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('provider_credentials_uq').on(t.orgId, t.providerId, t.label)]);

export const enginePreferences = pgTable('engine_preferences', {
  orgId: text('org_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  prefs: jsonb('prefs').$type<import('../providers/types').EnginePreferences>().notNull(),
  updatedAt: updatedAt(),
});

// ───────────────────────── Jobs (queue) ─────────────────────────

export const jobs = pgTable('jobs', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  sceneId: text('scene_id'),
  type: text('type').notNull(),
  status: text('status').notNull().default('queued'), // queued | running | succeeded | failed | canceled
  priority: integer('priority').notNull().default(0),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  progress: real('progress').notNull().default(0),
  runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  providerId: text('provider_id'),
  modelId: text('model_id'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [
  index('jobs_claim_idx').on(t.status, t.runAt),
  index('jobs_org_idx').on(t.orgId),
  index('jobs_project_idx').on(t.projectId),
]);

export const renders = pgTable('renders', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  jobId: text('job_id'),
  presetId: text('preset_id').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  fps: integer('fps').notNull(),
  status: text('status').notNull().default('queued'),
  videoAssetId: text('video_asset_id'),
  subtitleAssetId: text('subtitle_asset_id'),
  thumbnailAssetId: text('thumbnail_asset_id'),
  durationMs: integer('duration_ms'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
}, (t) => [index('renders_project_idx').on(t.projectId)]);

// ───────────────────────── Publishing ─────────────────────────

export const socialAccounts = pgTable('social_accounts', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  brandId: text('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  platform: text('platform').notNull(), // youtube | tiktok | instagram | facebook | blotato | local
  displayName: text('display_name').notNull(),
  externalId: text('external_id'),
  encryptedTokens: text('encrypted_tokens'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status').notNull().default('connected'),
  createdAt: createdAt(),
}, (t) => [index('social_accounts_org_idx').on(t.orgId)]);

export const publications = pgTable('publications', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  renderId: text('render_id').references(() => renders.id, { onDelete: 'set null' }),
  socialAccountId: text('social_account_id').references(() => socialAccounts.id, { onDelete: 'set null' }),
  platform: text('platform').notNull(),
  title: text('title').notNull().default(''),
  caption: text('caption').notNull().default(''),
  hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
  privacy: text('privacy').notNull().default('private'),
  thumbnailAssetId: text('thumbnail_asset_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  status: text('status').notNull().default('draft'),
  externalPostId: text('external_post_id'),
  externalUrl: text('external_url'),
  error: text('error'),
  jobId: text('job_id'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('publications_org_idx').on(t.orgId)]);

export const oauthStates = pgTable('oauth_states', {
  state: text('state').primaryKey(),
  orgId: text('org_id').notNull(),
  userId: text('user_id').notNull(),
  platform: text('platform').notNull(),
  codeVerifier: text('code_verifier'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ───────────────────────── Billing, usage, audit ─────────────────────────

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  limits: jsonb('limits').$type<import('../billing/types').PlanLimits>().notNull(),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  billingPriceRef: text('billing_price_ref'), // external price id (e.g. Stripe) — never hardcoded
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const subscriptions = pgTable('subscriptions', {
  orgId: text('org_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(),
  status: text('status').notNull().default('active'),
  billingProvider: text('billing_provider'),
  externalId: text('external_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
});

export const usageEvents = pgTable('usage_events', {
  id: id(),
  orgId: text('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  kind: text('kind').notNull(), // render.seconds | ai.image | ai.video.seconds | ai.tts.chars | ai.llm.tokens | ai.music.seconds | storage.bytes
  providerId: text('provider_id'),
  quantity: real('quantity').notNull(),
  estimatedCostUsd: real('estimated_cost_usd'),
  jobId: text('job_id'),
  createdAt: createdAt(),
}, (t) => [index('usage_org_kind_idx').on(t.orgId, t.kind, t.createdAt)]);

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  orgId: text('org_id'),
  userId: text('user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_org_idx').on(t.orgId, t.createdAt)]);

export const appSettings = pgTable('app_settings', {
  key: text('key').notNull(),
  scope: text('scope').notNull().default('global'),
  value: jsonb('value').$type<unknown>().notNull(),
}, (t) => [primaryKey({ columns: [t.key, t.scope] })]);
