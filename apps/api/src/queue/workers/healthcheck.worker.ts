import { Worker, Queue } from 'bullmq'
import { queueConnection } from '../connection'
import { db } from '../../lib/db'
import { services, auditLogs, projects } from '@highway/db'
import { eq } from 'drizzle-orm'
import { docker } from '../../lib/docker'
import { redis } from '../../lib/redis'
import { QUEUES } from '@highway/shared'

const FAILURE_KEY = (id: string) => `highway:health:${id}:failures`
const MAX_FAILURES = 3

export const healthCheckQueue = new Queue(QUEUES.HEALTH_CHECK, {
  connection: queueConnection,
})

export function startHealthCheckWorker() {
  const worker = new Worker(
    QUEUES.HEALTH_CHECK,
    async () => {
      // Fetch all running services that have a health check path
      const runningServices = await db.select().from(services)
        .where(eq(services.status, 'running'))

      for (const service of runningServices) {
        if (!service.healthCheckPath || !service.containerId) continue

        try {
          const containerInfo = await docker.getContainer(service.containerId).inspect()
          const networks = containerInfo.NetworkSettings?.Networks ?? {}
          const networkKeys = Object.keys(networks)
          const ip = networkKeys.length > 0 ? networks[networkKeys[0]]?.IPAddress : null
          if (!ip) continue

          const port = service.port ?? 3000
          const url = `http://${ip}:${port}${service.healthCheckPath}`

          let ok = false
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 5000)
            const res = await fetch(url, { signal: controller.signal })
            clearTimeout(timer)
            ok = res.ok
          } catch {
            ok = false
          }

          const failureKey = FAILURE_KEY(service.id)

          if (ok) {
            const prevFailures = parseInt((await redis.get(failureKey)) ?? '0')
            await redis.del(failureKey)
            if (prevFailures > 0) {
              await db.update(services).set({ status: 'running', updatedAt: new Date() })
                .where(eq(services.id, service.id))
            }
          } else {
            const failures = await redis.incr(failureKey)
            await redis.expire(failureKey, 300)

            if (failures >= MAX_FAILURES) {
              await db.update(services).set({ status: 'degraded' as const, updatedAt: new Date() })
                .where(eq(services.id, service.id))

              try {
                await docker.getContainer(service.containerId).restart({ t: 10 })
                console.log(`[healthcheck] Restarted container for service ${service.id}`)
              } catch (restartErr) {
                console.error(`[healthcheck] Failed to restart container for ${service.id}:`, restartErr)
              }

              await redis.del(failureKey)

              // Get the project's owner for audit log
              const [projectRow] = await db.select({ userId: projects.userId })
                .from(projects)
                .where(eq(projects.id, service.projectId))
                .limit(1)

              if (projectRow) {
                await db.insert(auditLogs).values({
                  userId: projectRow.userId,
                  action: 'service.auto_restart',
                  resourceType: 'service',
                  resourceId: service.id,
                  metadata: {
                    reason: 'health_check_failures',
                    failures,
                    containerId: service.containerId,
                  },
                })
              }
            }
          }
        } catch (err) {
          console.error(`[healthcheck] Error checking service ${service.id}:`, err)
        }
      }
    },
    {
      connection: queueConnection,
      concurrency: 1,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[healthcheck] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
