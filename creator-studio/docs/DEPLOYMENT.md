# Development & deployment

## Development

```bash
cd creator-studio
npm install                 # Node ≥ 22; FFmpeg + ffprobe must be on PATH
npm run dev                 # http://localhost:3000
```

- The embedded PostgreSQL (PGlite) stores data in `./data/pglite`, and files go to `./storage/data`. Delete both directories to reset.
- The first account you register becomes the platform admin (open `/admin` → System health).
- The job worker runs inside the dev server, so rendering, generation and publishing work without extra processes.
- Fonts are committed in `public/fonts` (SIL OFL). `npm run fonts:fetch` re-downloads them.

## Production (single node)

```bash
npm ci
npm run build
APP_ENCRYPTION_KEY=$(openssl rand -base64 32) APP_PUBLIC_URL=https://studio.example.com npm start
```

Single-node deployments can keep the embedded database, but PostgreSQL is recommended for anything beyond evaluation.

## Production (scalable)

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Run migrations once per release: `npm run db:migrate`.
3. Web nodes: `RUN_WORKER_IN_PROCESS=false npm start` (stateless; put them behind a load balancer with TLS).
4. Worker nodes: `npm run worker` (each needs FFmpeg; CPU-bound; scale by job volume). Workers coordinate through PostgreSQL row locks.
5. Storage: `STORAGE_DRIVER=s3` with a bucket shared by web and worker nodes (and `npm i @aws-sdk/client-s3`).
6. Set `APP_ENCRYPTION_KEY` (identical on all nodes) and `APP_PUBLIC_URL`, plus OAuth app credentials for the publishing platforms you enable.
7. The in-memory rate limiter is per process: for multi-node deployments, enforce limits at the load balancer as well, or back the limiter with Redis.

### Container image

A `Dockerfile` is provided (Node 22 + FFmpeg). **It has not been built in this environment** (no registry access during development), so treat it as a starting point:

```bash
docker build -t ai-creator-studio .
docker run -p 3000:3000 -e APP_ENCRYPTION_KEY=… -e DATABASE_URL=… ai-creator-studio
docker run -e APP_ENCRYPTION_KEY=… -e DATABASE_URL=… ai-creator-studio npm run worker
```

## Operations

- **Health**: `GET /api/health` (liveness). The admin console's System health tab checks the database, FFmpeg, storage, fonts, encryption key and worker heartbeat.
- **Jobs**: failed jobs keep their error, attempt count and partial result (e.g. a provider task id) and can be retried from the UI. Locks held by a crashed worker are re-queued after 10 minutes.
- **Backups**: PostgreSQL dumps plus the storage bucket. Keep `APP_ENCRYPTION_KEY` in your secret manager, because encrypted credentials are useless without it.
- **Audit**: `audit_logs` records sign-ups, logins, credential changes, membership changes, renders, publications and admin actions.
