# Architecture

## Overview

```
Browser (Next.js React UI, 5 languages, RTL)
 ├─ Template library / wizard / editor previews ──► shared renderer (Canvas 2D) ◄── same code
 └─ REST API (/api/**, cookie session, CSRF origin check, rate limits)
        │
        ▼
Service layer (src/lib/services/*) — every call is scoped by the caller's organization
 ├─ auth · projects · templates · brands · assets · engines · generation · publishing · usage · admin · audit
 └─ enqueue jobs ──► PostgreSQL `jobs` table (FOR UPDATE SKIP LOCKED)
                          │
                          ▼
              Worker (in-process for the embedded DB, or `npm run worker` processes)
               ├─ plan.generate   → offline planner | LLM adapter (Anthropic/OpenAI/Gemini)
               ├─ asset.image     → image adapter (OpenAI, Gemini, built-in procedural)
               ├─ asset.video     → video adapter (Veo, Runway, Kling, Seedance): submit → poll → download
               ├─ asset.voice     → TTS adapter (ElevenLabs w/ word timings, OpenAI)
               ├─ asset.music     → music adapter (built-in synth, ElevenLabs Music)
               ├─ render.video    → Skia frame renderer → FFmpeg (H.264 + AAC), SRT/VTT, thumbnail
               └─ publish.post    → YouTube / TikTok / Instagram / Facebook / Blotato / manual
Storage: local disk or S3-compatible (served only through authenticated routes or signed, expiring links)
```

## Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Rendering | **One isomorphic Canvas-2D renderer** (`src/lib/render/renderer.ts`) used by browser previews and by the export worker through Skia (`@napi-rs/canvas`) | Preview = export, frame-deterministic, no headless browser. Complex scripts (Hebrew, Arabic, Ge'ez) are shaped by HarfBuzz in both environments. |
| Remotion | Not used | Rendering for paying customers is "automation" under Remotion's license (Company License, per-render fees for companies with 4+ people). The built-in renderer avoids that cost and dependency. Remotion could be added later as an alternative backend. |
| Composition model | Serializable JSON timeline (`src/lib/composition/types.ts`): tracks → clips, normalized geometry, ms timing | One format for templates, editor, renders and versions; validated with Zod on every save. |
| Templates | Pure data (`src/lib/templates/library.ts`) + 18 reusable layouts + 14 style presets | Add templates without code; users create templates in the editor and they are stored as JSON. |
| Planning | Template skeleton + optional LLM content | The LLM never controls structure (scene count, layouts, media slots), so bad output cannot break rendering; failures fall back to the offline planner. |
| Database | Drizzle ORM; PostgreSQL in production, **PGlite** (PostgreSQL in WASM) for zero-setup dev/tests | Identical SQL dialect and migrations; tests run against real PostgreSQL semantics. |
| Queue | PostgreSQL table + `SKIP LOCKED` | Durable, transactional and horizontally scalable without extra infrastructure. A Redis/BullMQ backend can replace it behind the same interface. |
| Auth | Own session auth (scrypt, random tokens, SHA-256 hashes stored) | Small surface, fully tested. OIDC/SSO is on the roadmap. |
| Secrets | AES-256-GCM with `APP_ENCRYPTION_KEY`; never returned to the browser | Per-organization isolation of provider keys and social tokens. |
| i18n | Typed dictionaries (`src/lib/i18n/dict/*.ts`); the English shape is enforced on all locales by TypeScript | Missing translations become compile errors; RTL handled with logical CSS properties and `dir`. |

## Module map

| Path | Responsibility |
|---|---|
| `src/lib/composition/` | Timeline types, Zod schema, immutable editing ops, undo history |
| `src/lib/render/` | Renderer, text layout + bidi, procedural backgrounds, fonts, Node export (`node.ts`), presets |
| `src/lib/audio/synth.ts` | Procedural music synthesizer (WAV) |
| `src/lib/templates/` | Types, styles, layouts, engine (plan drafting + composition building), 50-template library, phrases, schema |
| `src/lib/planning/` | Plan types/schema, LLM planner (prompt, JSON schema, merge) |
| `src/lib/providers/` | Provider catalog, adapters, HTTP helpers, cost estimates |
| `src/lib/publishing/` | Platform adapters, OAuth, captions/hashtags |
| `src/lib/jobs/` | Queue, worker, handlers, runtime |
| `src/lib/services/` | Business logic + authorization (org scoping, RBAC, plan limits) |
| `src/lib/server/` | API wrapper, session helpers, range streaming |
| `src/lib/i18n/` | Locale config, dictionaries, formatting |
| `src/app/` | Next.js routes (UI pages + `/api/**`) |
| `src/components/` | UI: design system, player, template library/editor, project workspace, timeline editor |

## Database schema

Defined in `src/lib/db/schema.ts`; migrations live in `drizzle/`.

| Table | Purpose / key columns |
|---|---|
| `users` | email (unique), name, `password_hash` (scrypt), `ui_locale`, `is_platform_admin`, `disabled` |
| `organizations` | name, slug (unique), `plan_id` |
| `memberships` | (org, user) unique, `role` ∈ owner/admin/editor/viewer |
| `sessions` | `token_hash` (SHA-256), user, `active_org_id`, `expires_at` |
| `workspaces` | per-org folders for agencies/clients |
| `brands` | colors, fonts, logo asset, voice, preferred languages, social accounts, guidelines, reference assets |
| `projects` | type, status, template, inputs, settings (content language, aspect, duration, style, platforms…), production mode, **plan** (JSON), **composition** (JSON), `composition_revision` (optimistic concurrency) |
| `project_versions` | saved timeline snapshots |
| `assets` | uploads/generated/renders: kind, mime, `storage_key`, size, dimensions, duration, source, provider/model/prompt |
| `custom_templates` | user/org/platform template definitions (JSON), visibility, status |
| `provider_credentials` | per-org **encrypted** secrets, key hint, config |
| `engine_preferences` | per-org engine/model per task, quality, platform-key opt-in |
| `jobs` | type, status, payload/result, attempts/max, `run_at`, lock owner/time, progress, provider/model |
| `renders` | preset, dimensions, fps, status, video/subtitle/thumbnail assets |
| `social_accounts` | platform, external id, **encrypted** tokens, scopes, expiry |
| `publications` | platform, account, title/caption/hashtags, privacy, schedule, status, external id/url, error |
| `oauth_states` | short-lived OAuth state + PKCE verifier |
| `plans` / `subscriptions` | plan limits as data, external billing price ref, per-org subscription |
| `usage_events` | metered usage (render seconds, AI usage, publishes) with estimated cost |
| `audit_logs` | security-relevant actions with actor, target, IP |
| `app_settings` | misc key/value (e.g. worker heartbeat) |

## Request lifecycle & security

1. `api()` wrapper (`src/lib/server/api.ts`): rejects cross-origin mutations (Origin/Sec-Fetch-Site), applies IP and per-user rate limits, resolves the session cookie, parses JSON safely, maps errors (`AppError`, `ZodError`, `ProviderError`) to status codes and never leaks stack traces.
2. Services call `assertCan(actor, permission)` and filter every query by `actor.orgId`. Referenced asset ids are verified to belong to the same org before they enter a timeline.
3. Uploads are type-sniffed from magic bytes (client MIME is ignored; SVG/HTML rejected), size-capped, and stored under random keys. Files are served with `nosniff` + sandbox CSP.
4. Provider keys are decrypted only inside the worker/service at call time; error text is redacted before storage.
