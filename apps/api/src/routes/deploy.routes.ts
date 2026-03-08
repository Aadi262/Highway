import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { deployments, services, projects } from '@highway/db'
import { eq, and, desc } from 'drizzle-orm'
import { deployService } from '../services/deploy.service'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

// GET /api/services/:serviceId/deployments
app.get('/services/:serviceId/deployments', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const list = await db.select().from(deployments)
    .where(eq(deployments.serviceId, service.id))
    .orderBy(desc(deployments.createdAt))
    .limit(50)

  return c.json(list)
})

// GET /api/deployments/:id
app.get('/deployments/:id', async (c) => {
  const user = c.get('user') as User
  const [result] = await db
    .select({ deployment: deployments })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json(result.deployment)
})

// POST /api/deployments/:id/rollback
app.post('/deployments/:id/rollback', async (c) => {
  const user = c.get('user') as User
  const deploymentId = c.req.param('id')

  const [result] = await db
    .select({ deployment: deployments, serviceId: services.id })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.id, deploymentId), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)

  const rollback = await deployService.rollback(result.serviceId, deploymentId, user.id)
  return c.json(rollback)
})

// POST /api/deployments/:id/cancel
app.post('/deployments/:id/cancel', async (c) => {
  const user = c.get('user') as User
  const [result] = await db
    .select({ deployment: deployments })
    .from(deployments)
    .innerJoin(services, eq(deployments.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(deployments.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)
  if (!['queued', 'building'].includes(result.deployment.status)) {
    return c.json({ error: 'Deployment cannot be cancelled' }, 400)
  }

  await db.update(deployments).set({ status: 'cancelled', finishedAt: new Date() })
    .where(eq(deployments.id, result.deployment.id))

  return c.json({ ok: true })
})

async function getServiceForUser(serviceId: string, userId: string) {
  const [result] = await db
    .select({ service: services })
    .from(services)
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(services.id, serviceId), eq(projects.userId, userId)))
    .limit(1)
  return result?.service ?? null
}

export default app
