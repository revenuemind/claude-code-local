# AI providers & publishing integrations

**Status legend**
- **Built-in**: runs inside the studio. Tested end-to-end (including real renders).
- **Implemented**: the adapter is written against the provider's documented API and is covered by unit tests with *simulated* HTTP responses. **It has not been exercised against the live service**: this build environment has no provider accounts, and outbound access to provider APIs is blocked. Verify each one with your own key before relying on it.
- **Manual**: no official public API. Generate the asset externally and upload it.
- **Discontinued / Not available**: listed for transparency and cannot be selected.

Research was done in November 2026. Model IDs and prices change frequently: the Engine Manager accepts custom model IDs, and prices are labeled *indicative* (editable in `src/lib/providers/registry.ts`).

## AI engines

| Provider | Capabilities | Status | Endpoints used | Notes |
|---|---|---|---|---|
| Built-in | music, image (procedural) | Built-in | — | Procedural motion graphics, synthesized music beds, offline template planner. No cost. |
| Anthropic (Claude) | planning/scripts | Implemented | Official TypeScript SDK `@anthropic-ai/sdk` → `POST /v1/messages` | Default `claude-opus-5-5`. Uses structured JSON output (`output_config.format`) and the server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) on supported models. Refusals and `max_tokens` truncation are handled explicitly. |
| OpenAI | planning, images, TTS | Implemented | `/v1/chat/completions` (json_schema), `/v1/images/generations` (`gpt-image-2`), `/v1/audio/speech` (`gpt-4o-mini-tts`) | **Sora video API was shut down on 2026-09-24** and is not offered. TTS returns no word timestamps, so captions are estimated. |
| Google Gemini API | planning, images, **Veo** video | Implemented | `models/{m}:generateContent`, `models/veo-3.1-*:predictLongRunning` → poll `GET /v1beta/{operation}` → download URI with `x-goog-api-key` | Veo clips are 8 s, 9:16 or 16:9, with native audio and a SynthID watermark. |
| Runway | video | Implemented | `POST /v1/text_to_video`, `POST /v1/image_to_video`, `GET /v1/tasks/{id}`; header `X-Runway-Version: 2024-11-06` | `gen4.5` (text + image), `gen4_turbo` (image→video only). Durations 5/10 s. |
| Kling AI | video | Implemented | `POST /v1/videos/text2video|image2video`, `GET /v1/videos/{kind}/{task_id}` | Supports API-key auth or legacy access/secret key → HS256 JWT (exp ≤ 30 min). Base URL configurable for regional hosts. |
| Seedance (BytePlus ModelArk) | video | Implemented | `POST /api/v3/contents/generations/tasks`, `GET …/tasks/{id}` | Needs a ModelArk account with Seedance quota. Enter the exact model/endpoint ID from your console. Parameters are passed as `--ratio`/`--duration` in the text content. |
| ElevenLabs | TTS, music | Implemented | `POST /v1/text-to-speech/{voice}/with-timestamps`, `POST /v1/music` | Character alignment is converted to word timings for accurate karaoke captions. Music commercial rights depend on plan (film/TV needs Enterprise). |
| OpenAI Sora | video | **Discontinued** | — | API shut down 2026-09-24. |
| Suno | music | **Manual** | — | No official public API. Unofficial/reverse-engineered APIs are deliberately not used. |
| Midjourney | images | **Manual** | — | No official public API. |
| Luma Dream Machine | video/images | **Not available** | — | An official API exists, but no adapter has been written yet (roadmap). |

### Credentials & cost control
- Organizations connect their own keys (encrypted with AES-256-GCM and never sent to the browser). An organization can opt in to **platform-managed keys** (`PLATFORM_*_API_KEY`), which are metered against the plan's AI credit budget.
- Before each generation, the studio checks that credentials exist and that the plan budget is not exceeded, and shows an estimated cost. Usage events record the estimated cost per job.
- Video jobs persist the provider task id after submission, so a retry resumes polling instead of paying twice.

## Publishing

| Platform | Status | Flow | Platform constraints surfaced in the UI |
|---|---|---|---|
| YouTube | Implemented | OAuth 2.0 + PKCE (`youtube.upload`) → resumable upload `POST /upload/youtube/v3/videos?uploadType=resumable` → `PUT` bytes; optional `thumbnails/set`; refresh tokens handled | Uploads from unverified Google Cloud projects may be locked to private until audited. Scheduling uses `publishAt` (private until then). |
| TikTok | Implemented | OAuth (`video.publish`, PKCE) → Content Posting API `POST /v2/post/publish/video/init/` → chunked `PUT` upload | **Unaudited apps can only post SELF_ONLY (private)**. The adapter forces private unless `TIKTOK_APP_AUDITED=true`. |
| Instagram | Implemented | Meta OAuth → `POST /{ig-user}/media` (`media_type=REELS`, resumable upload to `rupload.facebook.com` or `video_url`) → poll `status_code` → `media_publish` | Requires a Business/Creator account linked to a Facebook Page. |
| Facebook Pages | Implemented | Meta OAuth → page token → `POST graph-video.facebook.com/{page}/videos` (multipart) | Supports scheduled publishing. |
| Blotato (optional) | Implemented | `POST /v2/media` (from a signed public URL) → `POST /v2/posts` | Optional third-party publisher; the studio does not depend on it. Requires `APP_PUBLIC_URL`. |
| Manual | Built-in | — | Download the video, subtitles and generated caption, then post yourself. |

Accounts can be connected through OAuth (when the corresponding client id/secret env vars are set) or by pasting an access token (useful for testing).

### Sources consulted
- BytePlus ModelArk: Create video generation task API: https://docs.byteplus.com/en/docs/ModelArk/create-video-generation-task-api
- Runway API reference: https://docs.dev.runwayml.com/api
- Kling authentication: https://kling.ai/document-api/api/get-started/authentication.md
- Gemini API Veo 3.1: https://ai.google.dev/gemini-api/docs/veo
- OpenAI Sora 2 model page (shutdown notice): https://developers.openai.com/api/docs/models/sora-2
- OpenAI image generation / speech: https://developers.openai.com/api/docs/guides/image-generation, https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- ElevenLabs Music API: https://elevenlabs.io/music-api
- TikTok Content Posting API (direct post): https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- YouTube videos.insert / quota: https://developers.google.com/youtube/v3/docs/videos/insert, https://developers.google.com/youtube/v3/determine_quota_cost
- Blotato publish API: https://help.blotato.com/api/publish-post
- Remotion licensing (why it is not used): https://www.remotion.dev/docs/license
