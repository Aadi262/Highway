import { Worker } from 'bullmq'
import { queueConnection } from '../connection'
import { deployService } from '../../services/deploy.service'
import { log } from '../../services/log.service'
import { db } from '../../lib/db'
import { deployments, services } from '@highway/db'
import { eq } from 'drizzle-orm'
import { QUEUES, type DeployJobPayload } from '@highway/shared'

export function startDeployWorker() {
  const worker = new Worker<DeployJobPayload>(
    QUEUES.DEPLOY,
    async (job) => {
      const { serviceId, deploymentId, imageName, envVars } = job.data

      const [service] = await db.select().from(services)
        .where(eq(services.id, serviceId))
        .limit(1)

      if (!service) throw new Error(`Service ${serviceId} not found`)

      const [deployment] = await db.select().from(deployments)
        .where(eq(deployments.id, deploymentId))
        .limit(1)

      if (!deployment) throw new Error(`Deployment ${deploymentId} not found`)

      try {
        await deployService.deploy({ service, deployment, imageName, envVars })
      } catch (err) {
        const errMsg = (err as Error).message
        await db.update(deployments).set({
          status: 'failed',
          errorMessage: errMsg,
          finishedAt: new Date(),
        }).where(eq(deployments.id, deploymentId))

        await db.update(services).set({ status: 'error', updatedAt: new Date() })
          .where(eq(services.id, serviceId))

        await log(deploymentId, `❌ Deployment failed: ${errMsg}`)
        throw err
      }
    },
    {
      connection: queueConnection,
      concurrency: 5,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`Deploy job ${job?.id} failed:`, err.message)
  })

  return worker
}
