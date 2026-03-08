import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import authRoutes from './routes/auth.routes'
import projectRoutes from './routes/project.routes'
import serviceRoutes from './routes/service.routes'
import databaseRoutes from './routes/database.routes'
import deployRoutes from './routes/deploy.routes'
import envRoutes from './routes/env.routes'
import domainRoutes from './routes/domain.routes'
import logRoutes from './routes/log.routes'
import metricsRoutes from './routes/metrics.routes'
import gitRoutes from './routes/git.routes'
import webhookRoutes from './routes/webhook.routes'
import templateRoutes from './routes/template.routes'
import volumeRoutes from './routes/volume.routes'

import { verifyDockerConnection } from './lib/docker'
import { redis } from './lib/redis'
import { db } from './lib/db'
import { startWorkers } from './queue/workers'
import { env } from './lib/env'

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new Hono()

app.use('*', cors({
  origin: env.WEB_URL,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
}))
app.use('*', logger())
app.use('*', secureHeaders())

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async (c) => {
  let dbOk = false
  let redisOk = false
  let dockerOk = false

  try { await db.execute(sql`SELECT 1`); dbOk = true } catch {}
  try { await redis.ping(); redisOk = true } catch {}
  try { await verifyDockerConnection(); dockerOk = true } catch {}

  const healthy = dbOk && redisOk && dockerOk
  return c.json(
    { status: healthy ? 'ok' : 'degraded', db: dbOk, redis: redisOk, docker: dockerOk },
    healthy ? 200 : 503
  )
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route('/api/auth', authRoutes)
app.route('/api', projectRoutes)          // /api/projects
app.route('/api', serviceRoutes)          // /api/projects/:id/services + /api/services/:id
app.route('/api', databaseRoutes)         // /api/projects/:id/databases + /api/databases/:id
app.route('/api', deployRoutes)           // /api/services/:id/deployments + /api/deployments/:id
app.route('/api', envRoutes)              // /api/services/:id/env
app.route('/api', domainRoutes)           // /api/services/:id/domains
app.route('/api', logRoutes)              // /api/services/:id/logs
app.route('/api', metricsRoutes)          // /api/services/:id/metrics
app.route('/api/git', gitRoutes)          // /api/git/repos
app.route('/api', templateRoutes)         // /api/templates
app.route('/api', volumeRoutes)           // /api/services/:id/volumes + /api/volumes/:id
app.route('/', webhookRoutes)             // /webhooks/github

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ─── Start ───────────────────────────────────────────────────────────────────

async function start() {
  console.log('🛣️  Highway API starting...')

  try {
    await verifyDockerConnection()
  } catch (err) {
    console.warn('⚠️  Docker not available — container operations will fail:', (err as Error).message)
  }

  await startWorkers()
  console.log(`✅ Highway API running on port ${env.PORT}`)
}

start()

// Export for Bun
export default {
  port: env.PORT,
  fetch: app.fetch,
}

// Import sql for health check
import { sql } from 'drizzle-orm'
