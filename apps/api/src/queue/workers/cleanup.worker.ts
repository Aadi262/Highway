import { Worker } from 'bullmq'
import { queueConnection } from '../connection'
import { dockerService } from '../../services/docker.service'
import { metricsService } from '../../services/metrics.service'
import { docker } from '../../lib/docker'
import { QUEUES } from '@highway/shared'

export function startCleanupWorker() {
  const worker = new Worker(
    QUEUES.CLEANUP,
    async () => {
      console.log('🧹 Running cleanup...')

      // Remove dangling images older than 24h
      try {
        const images = await docker.listImages({ filters: { dangling: ['true'] } })
        for (const img of images) {
          const ageHours = (Date.now() - (img.Created * 1000)) / 3600000
          if (ageHours > 24) {
            try { await docker.getImage(img.Id).remove() } catch {}
          }
        }
        console.log(`Cleaned ${images.length} dangling images`)
      } catch {}

      // Prune old metrics from DB
      await metricsService.pruneOldMetrics()
      console.log('Pruned old metrics')
    },
    { connection: queueConnection }
  )

  return worker
}
