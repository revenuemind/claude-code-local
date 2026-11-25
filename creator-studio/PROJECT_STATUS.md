# PROJECT_STATUS — AI Creator Studio

_Last updated: 2026-11-25_

## Context & findings from the initial inspection

- The assigned repository (`revenuemind/claude-code-local`) contained an unrelated, working project: a local-LLM proxy and launchers for Claude Code. There was **no existing Creator Studio code, specification or previous implementation**.
- **Decision**: build the studio as a self-contained app in `creator-studio/` so the existing project is untouched. It can be moved to its own repository at any time; nothing outside `creator-studio/` depends on it.

## Phase reports

| Phase | Scope | Status |
|---|---|---|
| 1 | Inspection, architecture, stack decisions | ✅ Done |
| 2 | App foundation, design system (dark studio UI, tokens, components) | ✅ Done |
| 3 | Auth, organizations, roles, projects, brands, audit | ✅ Done (workspace *UI* pending) |
| 4 | Composition model, isomorphic renderer, Template Engine, 50 templates, Template Editor | ✅ Done |
| 5 | Production planning (offline + LLM), rationale, requirements | ✅ Done |
| 6 | AI provider adapters + Engine Manager (credentials, models, costs) | ✅ Implemented — ⚠ live verification pending |
| 7 | Generation workspace (per-scene generation, variants, history, upload, retry) | ✅ Done |
| 8 | Timeline editor + FFmpeg rendering + presets + subtitles | ✅ Done |
| 9 | Publishing (YouTube, TikTok, Instagram, Facebook, Blotato, manual), scheduling, captions | ✅ Implemented — ⚠ live verification pending |
| 10 | 5-language UI with RTL, admin console, plans/limits/usage | ✅ Done (billing provider not connected) |
| 11 | Tests, E2E, docs | ✅ Done — 69 unit/integration + 6 E2E passing |

## Completed

- **Template library**: 50 templates (10 × 5 categories), 18 layouts, 14 style presets, live previews, detail player with audio, category/format/search filters, duplicate, JSON import/export, and a Template Editor (form + JSON + live preview + validation, draft/publish).
- **Three creation modes**: Code-only (fully working end to end), AI and Hybrid (per-project mode plus per-scene media mode overrides).
- **Pipeline**: project wizard (project info, setup, content, with a live preview) → production plan (concept, hook, scenes, narration, shot descriptions, visual prompts, music direction, captions, rationale, requirements/cost estimate; editable and approvable) → generation workspace → timeline editor → export presets (YouTube, Shorts, TikTok, Reels, IG feed, Facebook, square, custom) → publishing queue.
- **Renderer**: one Canvas-2D engine for preview and export; animated text (pop, words, typewriter, rise, blur, wipe…), karaoke caption styles, 13 transitions, 13 procedural backgrounds, Ken Burns, shapes, counters, brand logo, bidi-correct Hebrew/Arabic, Ethiopic.
- **Audio**: procedural music synth (10 moods), FFmpeg mixing with ducking under voiceover, fades, video audio.
- **Editor**: multi-track timeline, move/trim/split/duplicate/delete, snapping, track hide/mute/lock, inspector for every clip type, drag-to-position in the preview, undo/redo (coalesced), versions/restore, rebuild from plan, optimistic-concurrency saves, keyboard shortcuts.
- **Jobs**: PostgreSQL queue with exactly-once claiming, retries/backoff, cancellation, crash recovery, progress, and an in-process or standalone worker with heartbeat.
- **SaaS**: sessions, scrypt passwords, RBAC (owner/admin/editor/viewer), org isolation, encrypted credentials, CSRF/origin checks, rate limits, upload sniffing, signed expiring media links, audit log, plans as data, usage metering and limits, admin console (users, orgs/plans, jobs, plan limits, audit, health).
- **i18n**: en/he/ru/ar/am, typed dictionaries with compile-time completeness, RTL layouts, localized dates/numbers/currency, content language independent of UI language (12 content languages).

## Pending / next

See [`docs/ROADMAP.md`](docs/ROADMAP.md). The highest-priority items are:
1. Verify every AI and publishing adapter with real accounts, and add "test connection" actions.
2. Connect billing (Stripe) to the existing plans/usage model.
3. Workspace management UI; member invitations by email.
4. Reference-material ingestion (URL/PDF summarization) for the planner.
5. Native-speaker review of the Hebrew, Russian, Arabic and Amharic UI strings.

## Technical decisions (summary — details in docs/ARCHITECTURE.md)

| Topic | Decision |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 |
| Data | Drizzle ORM; PostgreSQL in production, PGlite (embedded PostgreSQL) for dev/tests |
| Rendering | Own isomorphic Canvas renderer (browser + Skia) → FFmpeg. Remotion was evaluated and not adopted (commercial automation license). |
| Queue | PostgreSQL `SKIP LOCKED` (no Redis needed); swappable |
| AI planning | Template-defined structure + LLM-written content, schema-validated, offline fallback |
| Anthropic integration | Official SDK, `claude-opus-5-5` default, structured outputs, server-side refusal fallback |
| Secrets | AES-256-GCM, per organization, never sent to the browser |
| Sora | Not integrated: the OpenAI Videos API was shut down on 2026-09-24 |
| Suno / Midjourney | Manual-only: no official public APIs; nothing reverse-engineered |

## Blockers

- **No provider or platform credentials** are available in the development environment, and outbound access to provider APIs is blocked, so live integration testing is not possible here. **Action for the owner**: add keys in the AI Engine Manager and OAuth app credentials in the environment, then run a test generation and a test publish per platform.
- TikTok public posting requires TikTok's Content Posting API audit. YouTube public uploads may require Google API verification. These are business processes outside the codebase.
