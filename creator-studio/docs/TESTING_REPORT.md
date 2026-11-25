# Testing report

Run on 2026-11-25 in the development container (Linux, Node 22, FFmpeg 6.1, Chromium via Playwright 1.63).

## Summary

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ no errors |
| Unit + integration (Vitest) | `npm test` | ✅ **74 / 74 passed** (9 files) |
| End-to-end (Playwright, production build, fresh DB) | `npm run build && npm run test:e2e` | ✅ **6 / 6 passed** |
| Production build | `npm run build` | ✅ all routes compiled |

## What is covered

**Unit / integration (real PGlite PostgreSQL, real Skia rendering, real FFmpeg):**
- `e2e-pipeline.test.ts`: template → offline plan → approval → timeline edit with optimistic concurrency (409 on stale revision) → render job through the real worker → MP4 verified with ffprobe (dimensions, audio stream, duration within 250 ms of the timeline). Also covers built-in music and procedural image generation jobs that update the plan and timeline.
- `templates.test.ts`: every template has a Hebrew example with the same fields as the English one; offline plans write concept, music/visual direction and rationale in the content language; built-in track, clip, scene-role and caption-style names are localized. All 50 templates validate against the schema, build valid plans and compositions for every supported aspect × mode, and render a non-blank frame. Also covers RTL font selection, brand application, interpolation and word timing.
- `composition.test.ts`: split (video trim continuity, caption partitioning), trim (head/tail, source bounds), move across tracks, duplicate, speed, undo/redo coalescing, and schema rejection of malicious or invalid input (client file paths stripped).
- `render.test.ts`: bidi ordering of mixed Hebrew/English lines, wrapping/auto-fit, crossfade pixel blending, RTL emphasis colors, determinism (byte-identical frames), SRT/VTT, hit testing, color contrast, deterministic WAV synthesis.
- `i18n.test.ts`: all 5 dictionaries have identical keys, no empty strings, preserved `{placeholders}`, <8% untranslated strings, direction mapping, locale negotiation, template names/descriptions and content phrases in all languages.
- `security.test.ts`: AES-GCM tamper detection, scrypt, rate limiting, magic-byte upload sniffing (SVG/HTML rejected), storage key traversal, signed-link expiry/forgery, secret redaction, the RBAC matrix, login/disabled accounts, **cross-organization isolation** (projects, brands, assets, credentials, and blocking another org's asset from being referenced in a timeline), keys encrypted at rest and never returned, viewer write denial, last-owner protection, and data-driven plan limits.
- `providers.test.ts`: Anthropic SDK request shape (structured output, refusal fallback, auth), refusal and 4xx handling; OpenAI image/TTS and 429 retryability; Gemini Veo long-running operation; Runway endpoints, ratios and version header; Kling JWT (verified HMAC) and status mapping; Seedance parameters; ElevenLabs alignment → word timings; built-in engines.
- `jobs-planning.test.ts`: exactly-once claiming under 10 concurrent claimers, retry with backoff vs permanent failure, manual retry/cancel, stale-lock recovery, unknown job types; LLM planner prompt/schema, merge semantics (structure preserved, unknown ids ignored), malformed output, and **automatic offline fallback when the AI provider rejects the request** (end to end through the worker).
- `publishing-api.test.ts`: caption/hashtag/chapter generation; YouTube resumable upload flow; TikTok SELF_ONLY enforcement; render → manual publication → `ready-for-manual`; API wrapper (401, CSRF 403, validation 400, malformed JSON 400).

**End-to-end (browser → production server):**
1. First account is platform admin; System health reports database, FFmpeg, storage and fonts OK.
2. Template library shows 50 live-preview templates, category filtering works, and the detail player opens.
3. Wizard (Hebrew content; Code-only is preselected because no AI engine is connected; the Example button fills Hebrew text) → plan → approve → editor (add text, edit, save, reload persists) → render 720p → video served with HTTP range (206, valid MP4 header) → generate caption → manual publish → "Ready for manual upload". No console errors.
4. Another organization gets 404 for the project page and API; non-admins get 404 for `/admin`.
5. Interface language switch: Hebrew/Arabic → `dir=rtl` with the sidebar mirrored; Russian/Amharic → `dir=ltr`; localized navigation.
6. Phone viewport (390 px): no horizontal overflow on dashboard, templates, engines and wizard; the mobile menu works.

## Bugs found by testing and fixed

- Procedural image engine: a signed bit shift produced a negative palette index (`>>` → `>>>`).
- Browser preview: canvas pixel height was not updated when only the height changed (stretched frames).
- Browser text layout cache held measurements taken before web fonts loaded, which caused overlapping emphasized words. The cache is now invalidated on font load.
- Admin console: switching tabs rendered the previous tab's payload with the new view (crash in production). Data is now keyed by tab, and a studio error boundary was added.
- Narration for comparison/checklist scenes ignored their left/right/bullet content.
- The wizard's Example button filled English text when the video language was Hebrew; offline plans and editor names were partly English. All localized now.
- Badge circles became ovals on landscape canvases; an English "vs" leaked into localized videos.

## Not tested (and why)

- **Live AI provider and social platform APIs.** There are no accounts or keys, and outbound access to these hosts is blocked from the build environment. Adapters are tested against simulated responses that follow the documented formats.
- **S3 storage driver** (no bucket available), the **Docker image** (not built), and multi-node PostgreSQL deployments (the embedded PostgreSQL was used for all tests; the SQL is identical).
- Browsers other than Chromium; screen-reader audits; load/performance testing beyond single renders.
