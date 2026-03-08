import { startBuildWorker } from './build.worker'
import { startDeployWorker } from './deploy.worker'
import { startCleanupWorker } from './cleanup.worker'
import { startHealthCheckWorker, healthCheckQueue } from './healthcheck.worker'
import { cleanupQueue } from '../queues'

export async function startWorkers() {
  startBuildWorker()
  startDeployWorker()
  startCleanupWorker()
  startHealthCheckWorker()

  // Schedule cleanup every 6 hours
  await cleanupQueue.add('cleanup', {}, {
    repeat: { pattern: '0 */6 * * *' },
    jobId: 'cleanup-cron',
  })

  // Schedule health checks every 30 seconds
  await healthCheckQueue.add('healthcheck', {}, {
    repeat: { every: 30_000 },
    jobId: 'healthcheck-cron',
  })

  console.log('✅ BullMQ workers started')
}
