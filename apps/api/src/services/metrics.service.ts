import { dockerService } from './docker.service'
import { db } from '../lib/db'
import { metrics, services } from '@highway/db'
import { eq, lt, and, gte } from 'drizzle-orm'
import { LIMITS } from '@highway/shared'

export const metricsService = {
  async collectForService(serviceId: string) {
    const [service] = await db.select({ containerId: services.containerId })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1)

    if (!service?.containerId) return null

    try {
      const stats = await dockerService.getStats(service.containerId)
      await db.insert(metrics).values({
        serviceId,
        cpuPercent: Math.round(stats.cpuPercent * 100), // store as integer (1250 = 12.50%)
        memoryMb: stats.memoryMb,
        memoryLimitMb: stats.memoryLimitMb,
        networkRxBytes: BigInt(stats.networkRxBytes),
        networkTxBytes: BigInt(stats.networkTxBytes),
        diskReadBytes: BigInt(stats.diskReadBytes),
        diskWriteBytes: BigInt(stats.diskWriteBytes),
      })
      return stats
    } catch {
      return null
    }
  },

  async getServiceMetrics(serviceId: string, hours = 1) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)
    return db.select().from(metrics)
      .where(and(eq(metrics.serviceId, serviceId), gte(metrics.timestamp, since)))
      .limit(500)
  },

  // Prune metrics older than retention period
  async pruneOldMetrics() {
    const cutoff = new Date(Date.now() - LIMITS.METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    await db.delete(metrics).where(lt(metrics.timestamp, cutoff))
  },
}
