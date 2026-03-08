import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { volumes, services, projects } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { docker } from '../lib/docker'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

// GET /api/services/:serviceId/volumes
app.get('/services/:serviceId/volumes', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const list = await db.select().from(volumes).where(eq(volumes.serviceId, service.id))
  return c.json(list)
})

// POST /api/services/:serviceId/volumes
app.post(
  '/services/:serviceId/volumes',
  zValidator('json', z.object({
    name: z.string().min(1).max(60),
    mountPath: z.string().min(1),
    sizeGb: z.number().min(1).max(100).default(1),
  })),
  async (c) => {
    const user = c.get('user') as User
    const service = await getServiceForUser(c.req.param('serviceId'), user.id)
    if (!service) return c.json({ error: 'Not found' }, 404)

    const { name, mountPath, sizeGb } = c.req.valid('json')
    const dockerVolumeName = `highway-vol-${service.id.slice(0, 8)}-${name.replace(/[^a-z0-9]/gi, '-')}`

    // Create Docker volume
    try {
      await docker.createVolume({
        Name: dockerVolumeName,
        Driver: 'local',
        Labels: {
          'managed-by': 'highway',
          'highway.service': service.id,
          'highway.volume': name,
        },
      })
    } catch (err: any) {
      // If volume already exists, that's fine
      if (!err.message?.includes('already exists')) throw err
    }

    const [volume] = await db.insert(volumes).values({
      serviceId: service.id,
      name,
      mountPath,
      sizeGb,
      dockerVolumeName,
    }).returning()

    return c.json(volume, 201)
  }
)

// DELETE /api/volumes/:id
app.delete('/volumes/:id', async (c) => {
  const user = c.get('user') as User
  const [result] = await db
    .select({ volume: volumes })
    .from(volumes)
    .innerJoin(services, eq(volumes.serviceId, services.id))
    .innerJoin(projects, eq(services.projectId, projects.id))
    .where(and(eq(volumes.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)

  // Remove Docker volume if it exists
  if (result.volume.dockerVolumeName) {
    try {
      const vol = docker.getVolume(result.volume.dockerVolumeName)
      await vol.remove()
    } catch {
      // Ignore if volume doesn't exist in Docker
    }
  }

  await db.delete(volumes).where(eq(volumes.id, result.volume.id))
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
