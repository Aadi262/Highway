import { Worker } from 'bullmq'
import { queueConnection } from '../connection'
import { buildService } from '../../services/build.service'
import { deployService } from '../../services/deploy.service'
import { log } from '../../services/log.service'
import { db } from '../../lib/db'
import { deployments, services } from '@highway/db'
import { eq } from 'drizzle-orm'
import { QUEUES, type BuildJobPayload } from '@highway/shared'
import { deployQueue } from '../queues'

export function startBuildWorker() {
  const worker = new Worker<BuildJobPayload>(
    QUEUES.BUILD,
    async (job) => {
      const { serviceId, trigger, commitHash, commitMessage, commitAuthor, branch, deploymentId } = job.data
      const buildStart = Date.now()

      // Fetch service
      const [service] = await db.select().from(services)
        .where(eq(services.id, serviceId))
        .limit(1)

      if (!service) throw new Error(`Service ${serviceId} not found`)
      if (!service.isActive) throw new Error('Service is not active')

      // Create or use existing deployment record
      let deployment = deploymentId
        ? (await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1))[0]
        : null

      if (!deployment) {
        const [created] = await db.insert(deployments).values({
          serviceId,
          status: 'building',
          trigger: trigger as any,
          commitHash,
          commitMessage,
          commitAuthor,
          branch: branch ?? service.gitBranch,
          startedAt: new Date(),
        }).returning()
        deployment = created
      } else {
        await db.update(deployments).set({ status: 'building', startedAt: new Date() })
          .where(eq(deployments.id, deployment.id))
      }

      // Mark service as building
      await db.update(services).set({ status: 'building', updatedAt: new Date() })
        .where(eq(services.id, serviceId))

      try {
        // Build the image
        const imageName = await buildService.build(service, deployment)
        const buildDuration = Math.round((Date.now() - buildStart) / 1000)

        // Update deployment with image info
        await db.update(deployments).set({
          imageName,
          buildDuration,
          status: 'deploying',
        }).where(eq(deployments.id, deployment.id))

        // Get decrypted env vars
        const envVars = await deployService.getDecryptedEnvVars(serviceId)

        // Hand off to deploy queue
        await deployQueue.add('deploy', {
          serviceId,
          deploymentId: deployment.id,
          imageName,
          envVars,
        }, { priority: 1 })

        await log(deployment.id, `📤 Build complete (${buildDuration}s) — queued for deployment`)
      } catch (err) {
        const errMsg = (err as Error).message
        await db.update(deployments).set({
          status: 'failed',
          errorMessage: errMsg,
          finishedAt: new Date(),
        }).where(eq(deployments.id, deployment.id))

        await db.update(services).set({ status: 'error', updatedAt: new Date() })
          .where(eq(services.id, serviceId))

        await log(deployment.id, `❌ Build failed: ${errMsg}`)
        throw err
      }
    },
    {
      connection: queueConnection,
      concurrency: 3, // Max 3 parallel builds
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`Build job ${job?.id} failed:`, err.message)
  })

  worker.on('completed', (job) => {
    console.log(`Build job ${job.id} completed`)
  })

  return worker
}
