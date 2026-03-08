import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { projects, services, databaseServices } from '@highway/db'
import { eq, and, desc } from 'drizzle-orm'
import { dockerService } from '../services/docker.service'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(255).optional(),
})

// GET /api/projects
app.get('/projects', async (c) => {
  const user = c.get('user') as User
  const list = await db.select().from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.createdAt))
  return c.json(list)
})

// POST /api/projects
app.post('/projects', zValidator('json', createSchema), async (c) => {
  const user = c.get('user') as User
  const { name, description } = c.req.valid('json')

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)

  const [project] = await db.insert(projects).values({
    userId: user.id,
    name,
    slug,
    description,
    dockerNetwork: `highway-${slug}`,
  }).returning()

  // Create isolated Docker network
  await dockerService.ensureProjectNetwork(slug)

  return c.json(project, 201)
})

// GET /api/projects/:id
app.get('/projects/:id', async (c) => {
  const user = c.get('user') as User
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!project) return c.json({ error: 'Not found' }, 404)

  const [svcList, dbList] = await Promise.all([
    db.select().from(services).where(eq(services.projectId, project.id)),
    db.select().from(databaseServices).where(eq(databaseServices.projectId, project.id)),
  ])

  return c.json({ ...project, services: svcList, databases: dbList })
})

// PATCH /api/projects/:id
app.patch('/projects/:id', zValidator('json', createSchema.partial()), async (c) => {
  const user = c.get('user') as User
  const [existing] = await db.select().from(projects)
    .where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!existing) return c.json({ error: 'Not found' }, 404)

  const updates = c.req.valid('json')
  const [updated] = await db.update(projects).set({ ...updates, updatedAt: new Date() })
    .where(eq(projects.id, existing.id))
    .returning()

  return c.json(updated)
})

// DELETE /api/projects/:id
app.delete('/projects/:id', async (c) => {
  const user = c.get('user') as User
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!project) return c.json({ error: 'Not found' }, 404)

  // Services + databases cascade-delete via FK. Clean up Docker network.
  await dockerService.removeProjectNetwork(project.slug)
  await db.delete(projects).where(eq(projects.id, project.id))

  return c.json({ ok: true })
})

export default app
