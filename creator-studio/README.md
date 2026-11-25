# AI Creator Studio

A multilingual SaaS studio for producing short- and long-form video from **templates**, **code-generated motion graphics**, **external AI engines**, or a **hybrid** of all three. It covers the full pipeline (project → production plan → media generation → timeline editing → rendering → publishing) in English, Hebrew, Russian, Arabic and Amharic, with full right-to-left support.

> Location note: this app lives in `creator-studio/` inside the `claude-code-local` repository. That repository's original project (a local-LLM proxy for Claude Code) is unrelated and untouched.

## What works today (verified by automated tests)

- **50 data-driven templates** in 5 categories, rendered live in the browser and on the server by the same renderer.
- **Code-only production end to end**: procedural motion backgrounds, animated typography, captions and transitions, plus a procedural music bed. Rendered to H.264/AAC MP4 with FFmpeg, with SRT/VTT subtitles and a thumbnail.
- **Template Engine + Template Editor**: build, preview, validate, publish, duplicate, import and export templates as JSON.
- **Production plans**: an offline template planner, or an AI planner (Anthropic, OpenAI or Gemini) with schema-validated output and automatic offline fallback.
- **Timeline editor**: multi-track; move, trim, split, duplicate and snap clips; edit text, captions, media, shapes, audio, animations and transitions; undo/redo; saved versions; conflict-safe saves.
- **Jobs**: a durable PostgreSQL queue with retries, backoff, cancellation, crash recovery and progress.
- **SaaS foundation**: accounts, organizations, roles, tenant isolation, encrypted credentials, data-driven plan limits, usage metering, audit log and an admin console.
- **5 interface languages** with RTL/LTR layouts. The language of each video is independent of the interface language.

Provider and publishing adapters (Anthropic, OpenAI, Gemini/Veo, Runway, Kling, Seedance, ElevenLabs, YouTube, TikTok, Instagram, Facebook, Blotato) are **implemented against each provider's documented API and tested with simulated responses only**. They have not been run against live accounts (see [`docs/API_INTEGRATIONS.md`](docs/API_INTEGRATIONS.md)).

## Quick start (local)

Requirements: Node.js ≥ 22, FFmpeg + ffprobe on `PATH`. A database is optional: the embedded PostgreSQL (PGlite) works out of the box.

```bash
cd creator-studio
npm install
npm run dev            # http://localhost:3000 — the first account you register becomes platform admin
```

Production build:

```bash
npm run build
npm start
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (the job worker runs in-process by default) |
| `npm run worker` | Standalone job worker (PostgreSQL deployments; scale horizontally) |
| `npm run db:migrate` | Apply migrations + seed plans |
| `npm run db:generate` | Generate a migration after editing `src/lib/db/schema.ts` |
| `npm test` | Unit + integration tests (Vitest; real PGlite, Skia, FFmpeg) |
| `npm run test:e2e` | Playwright end-to-end tests against a production build (`npm run build` first) |
| `npm run render:sample -- <templateId\|all> <aspect> <lang> <outDir> [--video]` | Render template stills/MP4 without the web app |
| `npm run typecheck` | TypeScript |

## Documentation

- [`PROJECT_STATUS.md`](PROJECT_STATUS.md): completed/pending work, technical decisions, blockers
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system design and database schema
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md): environment variables
- [`docs/API_INTEGRATIONS.md`](docs/API_INTEGRATIONS.md): AI providers and publishing platforms (status, endpoints, caveats)
- [`docs/TEMPLATES.md`](docs/TEMPLATES.md): template library and how to add templates
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): development and production deployment
- [`docs/TESTING_REPORT.md`](docs/TESTING_REPORT.md): what is tested and the latest results
- [`docs/ROADMAP.md`](docs/ROADMAP.md): known limitations and future work
