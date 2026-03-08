import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { db } from '../lib/db'
import { envVars, services, projects } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { encryptValue, decryptValue } from '../lib/encryption'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

const setVarsSchema = z.object({
  vars: z.record(z.string(), z.string()),
})

// GET /api/services/:serviceId/env — List keys (values masked)
app.get('/services/:serviceId/env', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const vars = await db.select({
    id: envVars.id,
    key: envVars.key,
    isSecret: envVars.isSecret,
    updatedAt: envVars.updatedAt,
  }).from(envVars).where(eq(envVars.serviceId, service.id))

  return c.json(vars)
})

// POST /api/services/:serviceId/env — Set (upsert) multiple vars
app.post('/services/:serviceId/env', zValidator('json', setVarsSchema), async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const { vars } = c.req.valid('json')

  for (const [key, value] of Object.entries(vars)) {
    const encrypted = encryptValue(value)
    const existing = await db.select({ id: envVars.id })
      .from(envVars).where(and(eq(envVars.serviceId, service.id), eq(envVars.key, key))).limit(1)

    if (existing.length > 0) {
      await db.update(envVars).set({
        encryptedValue: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: new Date(),
      }).where(eq(envVars.id, existing[0].id))
    } else {
      await db.insert(envVars).values({
        serviceId: service.id,
        key,
        encryptedValue: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
    }
  }

  return c.json({ ok: true, count: Object.keys(vars).length })
})

// GET /api/services/:serviceId/env/:key/reveal — Show decrypted value
app.get('/services/:serviceId/env/:key/reveal', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const [ev] = await db.select().from(envVars)
    .where(and(eq(envVars.serviceId, service.id), eq(envVars.key, c.req.param('key'))))
    .limit(1)

  if (!ev) return c.json({ error: 'Variable not found' }, 404)

  const value = decryptValue({ encrypted: ev.encryptedValue, iv: ev.iv, authTag: ev.authTag })
  return c.json({ key: ev.key, value })
})

// DELETE /api/services/:serviceId/env/:key
app.delete('/services/:serviceId/env/:key', async (c) => {
  const user = c.get('user') as User
  const service = await getServiceForUser(c.req.param('serviceId'), user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  await db.delete(envVars)
    .where(and(eq(envVars.serviceId, service.id), eq(envVars.key, c.req.param('key'))))

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
