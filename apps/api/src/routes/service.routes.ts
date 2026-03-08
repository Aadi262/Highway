import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { services, projects, deployments, envVars, databaseServices } from '@highway/db'
import { eq, and, desc } from 'drizzle-orm'
import { gitService } from '../services/git.service'
import { proxyService } from '../services/proxy.service'
import { dockerService } from '../services/docker.service'
import { databaseService } from '../services/database.service'
import { buildQueue } from '../queue/queues'
import { encryptValue } from '../lib/encryption'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

const createServiceSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['web', 'worker', 'cron']).default('web'),
  gitRepoId: z.string().optional(),
  gitRepoUrl: z.string().url().optional(),
  gitRepoName: z.string().optional(),
  gitBranch: z.string().default('main'),
  gitRootDir: z.string().default('/'),
  buildSystem: z.enum(['railpack', 'dockerfile', 'static']).default('railpack'),
  port: z.number().default(3000),
  startCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  installCommand: z.string().optional(),
  dockerfilePath: z.string().default('Dockerfile'),
  healthCheckPath: z.string().optional(),
  cpuLimit: z.number().default(50),
  memoryLimitMb: z.number().default(512),
  autoDeploy: z.boolean().default(true),
})

// GET /api/projects/:projectId/services
app.get('/projects/:projectId/services', async (c) => {
  const user = c.get('user') as User
  const { projectId } = c.req.param()

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1)
  if (!project) return c.json({ error: 'Not found' }, 404)

  const list = await db.select().from(services)
    .where(eq(services.projectId, projectId))
    .orderBy(desc(services.createdAt))

  return c.json(list)
})

// POST /api/projects/:projectId/services
app.post('/projects/:projectId/services', zValidator('json', createServiceSchema), async (c) => {
  const user = c.get('user') as User
  const { projectId } = c.req.param()
  const body = c.req.valid('json')

  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1)
  if (!project) return c.json({ error: 'Project not found' }, 404)

  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const autoDomain = proxyService.getAutoDomain(`${slug}-${project.slug}`)

  const [service] = await db.insert(services).values({
    projectId,
    name: body.name,
    slug: `${slug}-${project.slug.slice(0, 8)}`,
    type: body.type,
    gitRepoId: body.gitRepoId,
    gitRepoUrl: body.gitRepoUrl,
    gitRepoName: body.gitRepoName,
    gitBranch: body.gitBranch,
    gitRootDir: body.gitRootDir,
    buildSystem: body.buildSystem,
    port: body.port,
    startCommand: body.startCommand,
    buildCommand: body.buildCommand,
    installCommand: body.installCommand,
    dockerfilePath: body.dockerfilePath,
    healthCheckPath: body.healthCheckPath,
    cpuLimit: body.cpuLimit,
    memoryLimitMb: body.memoryLimitMb,
    autoDeploy: body.autoDeploy,
    autoDomain,
    networkAlias: slug,
    internalUrl: `http://${slug}.${project.slug}.internal`,
  }).returning()

  // Register GitHub webhook if repo connected
  if (body.gitRepoUrl && body.autoDeploy) {
    try {
      const [owner, repo] = (body.gitRepoName ?? '').split('/')
      if (owner && repo) {
        const webhookId = await gitService.registerWebhook(user.githubAccessToken, owner, repo)
        await db.update(services).set({ githubWebhookId: String(webhookId) })
          .where(eq(services.id, service.id))
      }
    } catch (err) {
      console.warn('Failed to register webhook:', err)
    }
  }

  return c.json(service, 201)
})

// GET /api/services/:id
app.get('/services/:id', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)
  return c.json(service)
})

// PATCH /api/services/:id
app.patch('/services/:id', zValidator('json', createServiceSchema.partial()), async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const updates = c.req.valid('json')
  const [updated] = await db.update(services).set({ ...updates, updatedAt: new Date() })
    .where(eq(services.id, service.id))
    .returning()

  return c.json(updated)
})

// POST /api/services/:id/deploy — Trigger manual deploy
app.post('/services/:id/deploy', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)
  if (!service.gitRepoUrl) return c.json({ error: 'No repository connected' }, 400)

  const job = await buildQueue.add('build', {
    serviceId: service.id,
    trigger: 'manual',
    branch: service.gitBranch ?? 'main',
  })

  return c.json({ ok: true, jobId: job.id })
})

// POST /api/services/:id/stop
app.post('/services/:id/stop', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)
  if (!service.containerId) return c.json({ error: 'No running container' }, 400)

  await dockerService.stopContainer(service.containerId)
  await proxyService.removeServiceRoutes(service.id)
  await db.update(services).set({ status: 'stopped', updatedAt: new Date() })
    .where(eq(services.id, service.id))

  return c.json({ ok: true })
})

// POST /api/services/:id/restart
app.post('/services/:id/restart', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  // Trigger a new deploy (re-uses existing image from last deployment)
  const [lastDeploy] = await db.select().from(deployments)
    .where(and(eq(deployments.serviceId, service.id), eq(deployments.status, 'success')))
    .orderBy(desc(deployments.createdAt))
    .limit(1)

  if (lastDeploy?.imageName) {
    const { deployQueue } = await import('../queue/queues')
    const { deployService } = await import('../services/deploy.service')
    const envVars = await deployService.getDecryptedEnvVars(service.id)
    await deployQueue.add('deploy', {
      serviceId: service.id,
      deploymentId: lastDeploy.id,
      imageName: lastDeploy.imageName,
      envVars,
    })
  } else {
    // No prior image — full rebuild
    await buildQueue.add('build', { serviceId: service.id, trigger: 'redeploy' })
  }

  return c.json({ ok: true })
})

// POST /api/services/:serviceId/link-database
app.post('/services/:serviceId/link-database',
  zValidator('json', z.object({ databaseServiceId: z.string().uuid() })),
  async (c) => {
    const user = c.get('user') as User
    const service = await getServiceForUser(c.req.param('serviceId'), user.id)
    if (!service) return c.json({ error: 'Not found' }, 404)

    const { databaseServiceId } = c.req.valid('json')

    // Verify database belongs to same project
    const [dbRecord] = await db.select().from(databaseServices)
      .where(and(eq(databaseServices.id, databaseServiceId), eq(databaseServices.projectId, service.projectId)))
      .limit(1)

    if (!dbRecord) return c.json({ error: 'Database not found in this project' }, 404)
    if (!dbRecord.host || !dbRecord.port || !dbRecord.dbName) {
      return c.json({ error: 'Database is not fully provisioned' }, 400)
    }

    // Get the decrypted password
    const password = await databaseService.getPassword(databaseServiceId)
    const vars = databaseService.buildIndividualVars(
      dbRecord.type as any,
      dbRecord.host,
      password,
      dbRecord.dbName,
    )

    // Upsert env vars (manual select-then-insert/update for compatibility)
    const injectedKeys: string[] = []
    for (const [key, value] of Object.entries(vars)) {
      const encrypted = encryptValue(value)
      const [existing] = await db.select({ id: envVars.id })
        .from(envVars)
        .where(and(eq(envVars.serviceId, service.id), eq(envVars.key, key)))
        .limit(1)

      if (existing) {
        await db.update(envVars).set({
          encryptedValue: encrypted.encrypted,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          updatedAt: new Date(),
        }).where(eq(envVars.id, existing.id))
      } else {
        await db.insert(envVars).values({
          serviceId: service.id,
          key,
          encryptedValue: encrypted.encrypted,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          isSecret: true,
        })
      }
      injectedKeys.push(key)
    }

    // If service is running, trigger redeploy so new vars take effect
    if (service.status === 'running' && service.gitRepoUrl) {
      await buildQueue.add('build', {
        serviceId: service.id,
        trigger: 'redeploy',
        branch: service.gitBranch ?? 'main',
      })
    }

    return c.json({ ok: true, injectedKeys })
  }
)

// DELETE /api/services/:id
app.delete('/services/:id', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('id'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  // Remove container
  if (service.containerId) {
    await dockerService.removeContainer(service.containerId, true)
  }

  // Remove webhook
  if (service.githubWebhookId && service.gitRepoName) {
    const [owner, repo] = service.gitRepoName.split('/')
    if (owner && repo) {
      await gitService.removeWebhook(user.githubAccessToken, owner, repo, Number(service.githubWebhookId))
    }
  }

  // Remove Caddy routes
  await proxyService.removeServiceRoutes(service.id)

  await db.delete(services).where(eq(services.id, service.id))
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
