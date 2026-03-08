import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import Redis from 'ioredis'
import { authMiddleware } from '../middleware/auth'
import { logService } from '../services/log.service'
import { dockerService } from '../services/docker.service'
import { db } from '../lib/db'
import { services, projects } from '@highway/db'
import { eq, and } from 'drizzle-orm'
import { REDIS_KEYS } from '@highway/shared'
import { env } from '../lib/env'
import type { User } from '@highway/db'

const app = new Hono()

// GET /api/services/:serviceId/logs/stream — SSE real-time log stream
// Supports both build logs (deploymentId) and runtime logs (containerId)
app.get('/services/:serviceId/logs/stream', authMiddleware, async (c) => {
  const user = c.get('user') as User
  const { serviceId } = c.req.param()
  const deploymentId = c.req.query('deploymentId') // for build logs

  const service = await getServiceForUser(serviceId, user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  // The streaming ID — either deployment (build) or service (runtime)
  const streamId = deploymentId ?? serviceId

  return streamSSE(c, async (stream) => {
    // 1. Send buffered logs first (last 200 lines)
    const buffered = await logService.getRecentLogs(streamId, 200)
    for (const entry of buffered) {
      await stream.writeSSE({ data: JSON.stringify(entry), event: 'log' })
    }

    // 2. Subscribe to real-time Redis pub/sub
    const subscriber = new Redis(env.REDIS_URL, { lazyConnect: false })
    await subscriber.subscribe(REDIS_KEYS.logChannel(streamId))

    subscriber.on('message', async (_channel, message) => {
      try {
        await stream.writeSSE({ data: message, event: 'log' })
      } catch {}
    })

    // 3. If runtime container — also attach Docker log stream
    if (!deploymentId && service.containerId) {
      try {
        const logStream = await dockerService.getLogStream(service.containerId)
        ;(logStream as any).on('data', async (chunk: Buffer) => {
          // Docker multiplexed stream: first 8 bytes are header
          const line = chunk.slice(8).toString().trim()
          if (!line) return
          const streamType = chunk[0] === 2 ? 'stderr' : 'stdout'
          await logService.appendLog(serviceId, line, streamType as any)
        })
        ;(logStream as any).on('end', () => {})
      } catch {}
    }

    // 4. Keep alive ping every 15s
    const pingInterval = setInterval(async () => {
      try {
        await stream.writeSSE({ data: '', event: 'ping' })
      } catch {}
    }, 15_000)

    // 5. Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(pingInterval)
      subscriber.unsubscribe()
      subscriber.quit()
    })

    // Keep connection open
    await new Promise<void>((resolve) => {
      stream.onAbort(resolve)
    })
  })
})

// GET /api/services/:serviceId/logs — Get buffered logs (REST, for initial load)
app.get('/services/:serviceId/logs', authMiddleware, async (c) => {
  const user = c.get('user') as User
  const { serviceId } = c.req.param()
  const deploymentId = c.req.query('deploymentId')
  const count = Math.min(Number(c.req.query('count') ?? '500'), 1000)

  const service = await getServiceForUser(serviceId, user.id)
  if (!service) return c.json({ error: 'Not found' }, 404)

  const streamId = deploymentId ?? serviceId
  const logs = await logService.getRecentLogs(streamId, count)
  return c.json(logs)
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
