# Environment variables

All variables are optional in development. A commented template is in [`.env.example`](../.env.example).

## Core

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | `postgres://…` uses PostgreSQL (production). Unset uses the embedded PGlite database. `memory://` gives an in-memory DB (tests). |
| `PGLITE_DIR` | `./data/pglite` | Embedded database directory. |
| `DB_AUTO_MIGRATE` | `true` | Apply migrations on startup. |
| `DATABASE_POOL_MAX` | `10` | PostgreSQL pool size. |
| `APP_ENCRYPTION_KEY` | dev-only key | **Required in production.** 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts provider keys and social tokens and signs media links. Rotating it makes stored secrets unreadable: reconnect providers after rotating. |
| `APP_PUBLIC_URL` | `http://localhost:3000` | Public origin used for OAuth redirect URIs and signed media links (Instagram `video_url`, Blotato). |
| `PLATFORM_ADMIN_EMAILS` | — | Comma-separated emails that become platform admins at sign-up. |
| `FIRST_USER_IS_ADMIN` | `true` | Whether the very first account becomes platform admin. |
| `DEFAULT_PLAN_ID` | `free` | Plan assigned to new organizations. |
| `INSECURE_COOKIES` | `false` | Allow session cookies over plain HTTP in production mode (local testing only). |
| `API_RATE_LIMIT_PER_MIN` | `600` | Per-user API request budget. |

## Storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` or `s3` (any S3-compatible service; `npm i @aws-sdk/client-s3` first). |
| `STORAGE_DIR` | `./storage/data` | Local storage root. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | — / `auto` / — | S3 settings (credentials via the standard `AWS_*` variables). |
| `MAX_UPLOAD_MB` | `500` | Upload size limit. |

## Jobs & rendering

| Variable | Default | Description |
|---|---|---|
| `RUN_WORKER_IN_PROCESS` | `true` | Run the job worker inside the web process. Must stay `true` with the embedded DB. With PostgreSQL, set `false` on web nodes and run `npm run worker`. |
| `WORKER_CONCURRENCY` | `2` | Jobs processed in parallel per worker. |
| `WORKER_POLL_MS` | `1000` | Queue poll interval. |
| `VIDEO_POLL_MS` / `VIDEO_TIMEOUT_MS` | `5000` / `1800000` | AI video task polling interval and timeout. |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Binaries. |
| `FONTS_DIR` | `./public/fonts` | Bundled fonts (shared by browser and renderer). |

## AI providers (platform-managed keys, optional)

`PLATFORM_ANTHROPIC_API_KEY`, `PLATFORM_OPENAI_API_KEY`, `PLATFORM_GEMINI_API_KEY`, `PLATFORM_RUNWAY_API_KEY`, `PLATFORM_KLING_API_KEY`, `PLATFORM_SEEDANCE_API_KEY`, `PLATFORM_ELEVENLABS_API_KEY`.

These are used only for organizations that enable "platform-managed keys" in the Engine Manager. Spend is checked against the plan's `aiCreditsUsdPerMonth`. Organizations normally connect their own keys in the UI instead (stored encrypted per organization).

## Publishing (OAuth apps, optional)

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | YouTube (redirect URI: `{APP_PUBLIC_URL}/api/publishing/oauth/youtube/callback`). |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_APP_AUDITED` | TikTok Content Posting API. Keep `TIKTOK_APP_AUDITED=false` until TikTok approves your audit (posts are private until then). |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` | Facebook Pages + Instagram (redirect URIs `…/oauth/facebook/callback`, `…/oauth/instagram/callback`). |
| `PUBLISH_POLL_MS` | Instagram container status polling interval. |
