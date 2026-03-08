# Highway — Self-Hosted Deployment Platform

## Architecture
- **Monorepo**: Turborepo — `apps/api` (Hono+Bun), `apps/web` (Next.js 14 App Router), `packages/db` (Drizzle ORM), `packages/shared` (types, constants, encryption)
- **Docker Engine API** via dockerode (Unix socket at `/var/run/docker.sock`)
- **Caddy v2** reverse proxy with auto-SSL (admin API at `localhost:2019` / `$CADDY_ADMIN`)
- **Railpack** for auto-building from source (successor to Nixpacks); Dockerfile as fallback
- **BullMQ + Redis** for async build/deploy job queues
- **SSE** for real-time log streaming (Redis pub/sub → SSE endpoint)
- **AES-256-GCM** for env var encryption at rest (key from `$ENCRYPTION_KEY`)
- **JWT** for API auth (no sessions — stateless Bearer tokens)

## Key Patterns

### Deployment Pipeline
1. GitHub push → webhook → `buildQueue.add('build', ...)`
2. Build worker: clone repo → Railpack/Dockerfile build → push to `deployQueue`
3. Deploy worker: create container → health check → Caddy route swap → stop old container
4. Logs stream via Redis pub/sub → SSE at `/api/services/:id/logs/stream`

### Zero-Downtime Deploys
- New container starts first (not yet in Caddy)
- Health check passes → Caddy route updated to new container IP
- Old container stopped gracefully

### Env Var Security
- Encrypted in DB with AES-256-GCM before write
- Decrypted only when injecting into containers at deploy time
- `reveal` endpoint decrypts a single key on demand (requires auth)

### Docker Networking
- `highway-public` — Caddy + app container (internet-facing)
- `highway-internal` — Platform Postgres + Redis (never exposed)
- `highway-{project-slug}` — Per-project Docker bridge network (user services communicate here)
- User containers NEVER join `highway-internal`

## Commands
```bash
# Local dev
docker compose up -d          # Start platform Postgres + Redis
bun run dev                   # API (apps/api) — hot reload
bun run --filter @highway/web dev  # Frontend (apps/web)

# Database
bun run db:migrate            # Run Drizzle migrations (packages/db)
bun run db:push               # Push schema changes without migration file

# Production
docker compose -f docker-compose.prod.yml up -d  # Full stack on VPS
docker compose -f docker-compose.prod.yml logs -f app  # App logs
```

## Project Structure
```
apps/api/src/
  index.ts              — Hono app entry, route registration, startup
  routes/               — Hono route handlers (one file per resource)
  services/             — Core business logic (docker, build, deploy, proxy, log, git, metrics)
  queue/workers/        — BullMQ async job processors
  lib/                  — Shared instances (docker, db, redis, env, jwt, encryption)
  middleware/           — Auth, rate limit

apps/web/src/
  app/(dashboard)/      — Dashboard pages (projects, databases, monitoring)
  app/login/            — GitHub OAuth login
  app/auth/callback/    — OAuth callback (stores JWT)
  components/           — React components
  lib/api.ts            — Typed fetch wrapper for all API calls
  lib/hooks/            — useSSE, useAuth
  lib/store.ts          — Zustand auth store

packages/db/src/schema.ts     — Drizzle schema (source of truth for all tables)
packages/shared/src/
  types.ts              — Shared TS types (LogEntry, ContainerStats, job payloads)
  constants.ts          — Platform limits, Redis key patterns, queue names, Docker/Caddy config
  encryption.ts         — AES-256-GCM encrypt/decrypt helpers
```

## File Conventions
- `apps/api/src/services/*.service.ts` — Pure business logic, no HTTP concerns
- `apps/api/src/routes/*.routes.ts` — Thin HTTP handlers, delegates to services
- All routes use explicit resource prefixes: `/projects/:id`, `/services/:id`, etc.
- Frontend API calls go through `apps/web/src/lib/api.ts` (single source of truth for URLs)

## Environment Variables (API)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for webhook verification |
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars) |
| `ENCRYPTION_KEY` | Key for AES-256-GCM env var encryption (min 16 chars) |
| `PLATFORM_DOMAIN` | Base domain (e.g., `deploy.yourdomain.com`) |
| `CADDY_ADMIN` | Caddy admin API URL (default: `http://localhost:2019`) |
| `WEB_URL` | Frontend URL for CORS and OAuth redirects |
| `API_URL` | API URL for webhook registration |
