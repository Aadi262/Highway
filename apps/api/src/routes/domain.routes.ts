import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { domains, services, projects } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { proxyService } from '../services/proxy.service'
import { dockerService } from '../services/docker.service'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

// GET /api/services/:serviceId/domains
app.get('/services/:serviceId/domains', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const list = await db.select().from(domains).where(eq(domains.serviceId, service.id))
  return c.json(list)
})

// POST /api/services/:serviceId/domains
app.post('/services/:serviceId/domains',
  zValidator('json', z.object({ hostname: z.string().min(3) })),
  async (c) => {
    const user = c.get('user') as User
    const service = await getServiceForUser(c.req.param('serviceId'), user.id)
    if (!service) return c.json({ error: 'Not found' }, 404)

    const { hostname } = c.req.valid('json')

    // Check domain not already registered
    const [existing] = await db.select().from(domains).where(eq(domains.hostname, hostname)).limit(1)
    if (existing) return c.json({ error: 'Domain already registered' }, 409)

    const [domain] = await db.insert(domains).values({
      serviceId: service.id,
      hostname,
      type: 'custom',
      sslStatus: 'pending',
    }).returning()

    // Add to Caddy if container is running
    if (service.containerId) {
      try {
        const { projects: projectsTable } = await import('@highway/db')
        const [project] = await db.select({ slug: projectsTable.slug })
          .from(projectsTable).where(eq(projectsTable.id, service.projectId)).limit(1)

        if (project) {
          const networkName = `highway-${project.slug}`
          const containerIp = await dockerService.getContainerIp(service.containerId, networkName)
          if (containerIp) {
            const routeId = await proxyService.addCustomDomain(service, hostname, containerIp)
            await db.update(domains).set({ caddyRouteId: routeId, sslStatus: 'provisioning' })
              .where(eq(domains.id, domain.id))
          }
        }
      } catch (err) {
        console.error('Failed to add domain to Caddy:', err)
      }
    }

    return c.json(domain, 201)
  }
)

// DELETE /api/domains/:id
app.delete('/domains/:id', async (c) => {
  const user = c.get('user') as User
  const [result] = await db
    .select({ domain: domains })
    .from(domains)
    .innerJoin(services, eq(domains.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(domains.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)

  if (result.domain.caddyRouteId) {
    await proxyService.removeRoute(result.domain.caddyRouteId)
  }

  await db.delete(domains).where(eq(domains.id, result.domain.id))
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
