import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { metricsService } from '../services/metrics.service'
import { db } from '../lib/db'
import { metrics, services, projects } from '@highway/db'
import { eq, and, gte, desc } from 'drizzle-orm'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

// GET /api/services/:serviceId/metrics?hours=1
app.get('/services/:serviceId/metrics', async (c) => {
  const user = c.get('user') as User
  const hours = Math.min(Number(c.req.query('hours') ?? '1'), 168) // max 7 days

  const [result] = await db
    .select({ service: services })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(services.id, c.req.param('serviceId')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)

  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const data = await db.select().from(metrics)
    .where(and(
      eq(metrics.serviceId, result.service.id),
      gte(metrics.timestamp, since),
    ))
    .orderBy(desc(metrics.timestamp))
    .limit(500)

  return c.json(data)
})

// GET /api/services/:serviceId/metrics/live — Current container stats
app.get('/services/:serviceId/metrics/live', async (c) => {
  const user = c.get('user') as User

  const [result] = await db
    .select({ service: services })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(services.id, c.req.param('serviceId')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)

  const stats = await metricsService.collectForService(result.service.id)
  return c.json(stats ?? { error: 'Container not running' })
})

export default app
