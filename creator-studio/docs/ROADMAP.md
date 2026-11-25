# Known limitations & roadmap

## Known limitations

1. **External integrations are unverified against live services.** All AI-provider and publishing adapters follow documented APIs and pass simulated-response tests, but have not been run with real accounts. Model IDs (especially OpenAI/Gemini text models, Kling and Seedance) must be confirmed in each provider's console. The Engine Manager accepts custom IDs.
2. **No offline text-to-speech.** Code-only videos use on-screen text, captions and procedural music. Voiceover needs a TTS provider (ElevenLabs or OpenAI) or uploaded audio.
3. **Reference material is not analyzed automatically.** Reference notes are passed to the AI planner, but source URLs are stored without being fetched or summarized (no web-research step yet).
4. **Multi-format exports re-lay out from the plan.** Exporting to a different aspect ratio than the project's primary format rebuilds the timeline from the plan (media, voice and music are kept); manual timeline edits apply to the primary format only.
5. **Editor scope.** There is no ripple editing, keyframe curves, per-clip audio waveforms, or video-in-video masks. Transitions are per track (the background/media tracks carry scene transitions; text uses enter/exit animations). Video preview seeking depends on the browser's codec support.
6. **Rendering is CPU-only** (Skia + libx264). Measured on a 4-vCPU container: a 30 s 1080×1920 code-only video rendered in 27 s (0.9× real time), and a 90 s 1920×1080 video in 68 s (0.76×). Timelines with many video clips (FFmpeg decoding) and 4K exports are slower. Scale with more workers.
7. **In-memory rate limiting** is per process (use the load balancer or Redis in multi-node setups).
8. **Billing is prepared, not connected.** Plans and limits are data and usage is metered, but no payment provider (e.g. Stripe) is integrated; admins assign plans.
9. **Fonts.** The bundled set covers Latin, Cyrillic, Hebrew, Arabic and Ethiopic. CJK and Devanagari content renders with system fallbacks only, so those content languages are not offered.
10. **Translations.** Example content exists in English and Hebrew; other video languages fall back to the English example (the wizard says so). UI strings in Hebrew, Russian, Arabic and Amharic were machine-assisted and should be reviewed by native speakers (especially Amharic) before launch.
11. **Workspaces** exist in the data model (projects/brands can belong to one), but the UI does not yet expose workspace management.
12. **Embedded database** (PGlite) is single-process; use PostgreSQL to run separate worker processes.

## Roadmap

**Near term**
- Verify every provider adapter with real keys; add connection "test" buttons; refresh model catalogs from provider APIs.
- Luma and additional video engines; Imagen image models; avatar/lip-sync providers for the AI-influencer templates.
- Reference-material analysis: fetch and summarize source URLs/PDFs into the planner prompt (with explicit user opt-in).
- LLM-assisted captions/hashtags per platform; A/B title variants.
- Workspace management UI and per-client brand switching in the shell.

**Mid term**
- Stripe billing (checkout, webhooks, metered AI credits), seat management and invitations by email.
- Template marketplace (share, sell, purchase), with review and licensing.
- Editor: ripple trim, keyframes, waveform display, multi-select, clip groups, scene-level transitions, beat-synced cuts.
- GPU or distributed rendering; render farm autoscaling; HLS previews.
- Redis-backed rate limiting; OpenTelemetry tracing; structured logs.
- SSO (OIDC/SAML) for agencies; granular project-level permissions.

**Long term**
- Automated content series (scheduled generation + publishing pipelines).
- Analytics ingestion from platforms to inform planning.
- Additional interface and content languages (with fonts for CJK and Indic scripts).
