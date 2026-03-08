import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { services, projects, databaseServices, envVars } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { databaseService } from '../services/database.service'
import { proxyService } from '../services/proxy.service'
import { buildQueue } from '../queue/queues'
import { encryptValue } from '../lib/encryption'
import type { User } from '@highway/db'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const app = new Hono()
app.use('*', authMiddleware)

// Load templates from JSON files
function loadTemplates() {
  const templatesDir = join(process.cwd(), '..', '..', 'templates')
  try {
    const files = readdirSync(templatesDir).filter(f => f.endsWith('.json'))
    return files.map(f => {
      const content = readFileSync(join(templatesDir, f), 'utf-8')
      return JSON.parse(content)
    })
  } catch {
    // Fallback to embedded templates if directory not found
    return EMBEDDED_TEMPLATES
  }
}

const EMBEDDED_TEMPLATES = [
  {
    name: 'Next.js', slug: 'nextjs', description: 'Full-stack React framework with SSR, API routes, and automatic routing',
    icon: '▲', category: 'framework',
    services: [{ name: 'web', type: 'app', source: 'docker_image', dockerImage: 'node', dockerTag: '20-alpine', port: 3000, startCommand: 'npm start' }],
  },
  {
    name: 'Express + PostgreSQL', slug: 'express-postgres', description: 'Node.js REST API with Express and PostgreSQL',
    icon: '🟢', category: 'framework',
    services: [
      { name: 'api', type: 'app', source: 'docker_image', dockerImage: 'node', dockerTag: '20-alpine', port: 3000, startCommand: 'node index.js' },
      { name: 'db', type: 'database', dbEngine: 'postgres', linkTo: 'api' },
    ],
  },
  {
    name: 'Hono + Bun', slug: 'hono-bun', description: 'Ultra-fast API server with Hono on Bun runtime',
    icon: '🔥', category: 'framework',
    services: [{ name: 'api', type: 'app', source: 'docker_image', dockerImage: 'oven/bun', dockerTag: 'latest', port: 3000, startCommand: 'bun run src/index.ts' }],
  },
  {
    name: 'WordPress', slug: 'wordpress', description: 'WordPress CMS with MySQL and persistent storage',
    icon: '📝', category: 'cms',
    services: [
      { name: 'wordpress', type: 'app', source: 'docker_image', dockerImage: 'wordpress', dockerTag: 'latest', port: 80 },
      { name: 'db', type: 'database', dbEngine: 'mysql', linkTo: 'wordpress' },
    ],
  },
  {
    name: 'n8n', slug: 'n8n', description: 'Workflow automation — self-hosted Zapier alternative',
    icon: '⚡', category: 'automation',
    services: [
      { name: 'n8n', type: 'app', source: 'docker_image', dockerImage: 'n8nio/n8n', dockerTag: 'latest', port: 5678 },
      { name: 'db', type: 'database', dbEngine: 'postgres', linkTo: 'n8n' },
    ],
  },
  {
    name: 'Django + PostgreSQL', slug: 'django-postgres', description: 'Python Django web framework with PostgreSQL',
    icon: '🐍', category: 'framework',
    services: [
      { name: 'web', type: 'app', source: 'docker_image', dockerImage: 'python', dockerTag: '3.12-slim', port: 8000, startCommand: 'gunicorn myproject.wsgi:application --bind 0.0.0.0:8000' },
      { name: 'db', type: 'database', dbEngine: 'postgres', linkTo: 'web' },
    ],
  },
]

// GET /api/templates
app.get('/templates', (c) => {
  return c.json(loadTemplates())
})

// GET /api/templates/:slug
app.get('/templates/:slug', (c) => {
  const templates = loadTemplates()
  const template = templates.find((t: any) => t.slug === c.req.param('slug'))
  if (!template) return c.json({ error: 'Template not found' }, 404)
  return c.json(template)
})

// POST /api/templates/:slug/deploy
app.post(
  '/templates/:slug/deploy',
  zValidator('json', z.object({
    projectId: z.string().uuid(),
    overrides: z.record(z.string()).optional(),
  })),
  async (c) => {
    const user = c.get('user') as User
    const templates = loadTemplates()
    const template = templates.find((t: any) => t.slug === c.req.param('slug'))
    if (!template) return c.json({ error: 'Template not found' }, 404)

    const { projectId, overrides = {} } = c.req.valid('json')

    // Verify project belongs to user
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .limit(1)
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const createdServices: Record<string, any> = {}
    const createdDbs: Record<string, any> = {}

    // First pass: provision database services
    for (const svc of template.services) {
      if (svc.type !== 'database') continue
      const engine = svc.dbEngine ?? 'postgres'
      const result = await databaseService.provision({
        name: svc.name,
        engine,
        projectId,
        projectSlug: project.slug,
      })
      createdDbs[svc.name] = { ...result, engine, svc }
    }

    // Second pass: create app services
    for (const svc of template.services) {
      if (svc.type !== 'app') continue

      const slug = `${svc.name}-${project.slug.slice(0, 8)}`
      const autoDomain = proxyService.getAutoDomain(`${slug}`)

      const [created] = await db.insert(services).values({
        projectId,
        name: svc.name,
        slug,
        type: 'web',
        status: 'idle',
        port: svc.port ?? 3000,
        startCommand: svc.startCommand ?? overrides.startCommand,
        buildCommand: svc.buildCommand ?? overrides.buildCommand,
        autoDomain,
        networkAlias: svc.name,
        internalUrl: `http://${svc.name}.${project.slug}.internal`,
      }).returning()

      createdServices[svc.name] = created

      // Inject template env vars
      const templateEnv: Record<string, string> = { ...svc.env, ...overrides }

      // Resolve ${db.FIELD} references
      for (const [key, rawVal] of Object.entries(templateEnv)) {
        let val = rawVal as string
        for (const [dbName, dbData] of Object.entries(createdDbs)) {
          const dbVars = dbData.individualVars as Record<string, string>
          for (const [varKey, varVal] of Object.entries(dbVars)) {
            val = val.replace(`\${${dbName}.${varKey}}`, varVal)
          }
        }
        const encrypted = encryptValue(val)
        await db.insert(envVars).values({
          serviceId: created.id,
          key,
          encryptedValue: encrypted.encrypted,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          isSecret: true,
        })
      }

      // If this service links to a database, inject DATABASE_URL and friends
      if (svc.linkTo && createdDbs[svc.linkTo]) {
        const dbData = createdDbs[svc.linkTo]
        const dbVars: Record<string, string> = dbData.individualVars
        for (const [k, v] of Object.entries(dbVars)) {
          // Only insert if not already set by templateEnv
          if (!(k in templateEnv)) {
            const encrypted = encryptValue(v)
            await db.insert(envVars).values({
              serviceId: created.id,
              key: k,
              encryptedValue: encrypted.encrypted,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              isSecret: true,
            })
          }
        }
      }

      // Queue a build if source is git (not docker_image)
      if (svc.source !== 'docker_image') {
        await buildQueue.add('build', {
          serviceId: created.id,
          trigger: 'manual',
          branch: 'main',
        })
      }
    }

    return c.json({
      ok: true,
      services: Object.values(createdServices),
      databases: Object.values(createdDbs).map((d: any) => d.dbRecord),
    }, 201)
  }
)

export default app
