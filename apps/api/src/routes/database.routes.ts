import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { databaseServices, projects } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { databaseService } from '../services/database.service'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

const provisionSchema = z.object({
  name: z.string().min(1).max(40),
  engine: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'mariadb']),
  memoryLimitMb: z.number().default(512),
})

// GET /api/projects/:projectId/databases
app.get('/projects/:projectId/databases', async (c) => {
  const user = c.get('user') as User
  const { projectId } = c.req.param()

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id))).limit(1)
  if (!project) return c.json({ error: 'Not found' }, 404)

  const list = await db.select().from(databaseServices)
    .where(eq(databaseServices.projectId, projectId))

  return c.json(list)
})

// POST /api/projects/:projectId/databases
app.post('/projects/:projectId/databases', zValidator('json', provisionSchema), async (c) => {
  const user = c.get('user') as User
  const { projectId } = c.req.param()
  const { name, engine, memoryLimitMb } = c.req.valid('json')

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id))).limit(1)
  if (!project) return c.json({ error: 'Project not found' }, 404)

  const engineMap: Record<string, string> = {
    postgresql: 'postgres', mysql: 'mysql', mongodb: 'mongodb', redis: 'redis', mariadb: 'mariadb'
  }
  const dockerEngine = engineMap[engine] as any

  const result = await databaseService.provision({
    name,
    engine: dockerEngine,
    projectId,
    projectSlug: project.slug,
    memoryLimitMb,
  })

  // Return once — password not stored in plaintext
  return c.json({
    database: result.dbRecord,
    connectionString: result.connectionString,
    password: result.password,
    individualVars: result.individualVars,
    warning: 'Save your credentials now — they cannot be retrieved again.',
  }, 201)
})

// GET /api/databases — List all databases for the current user across all projects
app.get('/databases', async (c) => {
  const user = c.get('user') as User
  const list = await db
    .select({ db: databaseServices })
    .from(databaseServices)
    .innerJoin(projects, eq(databaseServices.projectId, projects.id))
    .where(eq(projects.userId, user.id))
  return c.json(list.map((r) => r.db))
})

// GET /api/databases/:id
app.get('/databases/:id', async (c) => {
  const user = c.get('user') as User
  const [result] = await db
    .select({ db: databaseServices })
    .from(databaseServices)
    .innerJoin(projects, eq(databaseServices.projectId, projects.id))
    .where(and(eq(databaseServices.id, c.req.param('id')), eq(projects.userId, user.id)))
    .limit(1)

  if (!result) return c.json({ error: 'Not found' }, 404)
  return c.json(result.db)
})

// POST /api/databases/:id/stop
app.post('/databases/:id/stop', async (c) => {
  const user = c.get('user') as User
  if (!await isOwner(c.req.param('id'), user.id)) return c.json({ error: 'Not found' }, 404)
  await databaseService.stop(c.req.param('id'))
  return c.json({ ok: true })
})

// POST /api/databases/:id/start
app.post('/databases/:id/start', async (c) => {
  const user = c.get('user') as User
  if (!await isOwner(c.req.param('id'), user.id)) return c.json({ error: 'Not found' }, 404)
  await databaseService.start(c.req.param('id'))
  return c.json({ ok: true })
})

// DELETE /api/databases/:id
app.delete('/databases/:id', async (c) => {
  const user = c.get('user') as User
  if (!await isOwner(c.req.param('id'), user.id)) return c.json({ error: 'Not found' }, 404)
  await databaseService.remove(c.req.param('id'))
  return c.json({ ok: true })
})

async function isOwner(dbId: string, userId: string): Promise<boolean> {
  const [result] = await db
    .select({ id: databaseServices.id })
    .from(databaseServices)
    .innerJoin(projects, eq(databaseServices.projectId, projects.id))
    .where(and(eq(databaseServices.id, dbId), eq(projects.userId, userId)))
    .limit(1)
  return !!result
}

export default app
