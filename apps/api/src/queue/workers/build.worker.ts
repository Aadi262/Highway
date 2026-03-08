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

function step(msg: string) {
  return `\x1b[1m\x1b[36m==>\x1b[0m \x1b[1m${msg}\x1b[0m`
}
function success(msg: string) {
  return `\x1b[32m✓\x1b[0m ${msg}`
}
function fail(msg: string) {
  return `\x1b[31m✗\x1b[0m ${msg}`
}

export function startBuildWorker() {
  const worker = new Worker<BuildJobPayload>(
    QUEUES.BUILD,
    async (job) => {
      const { serviceId, trigger, commitHash, commitMessage, commitAuthor, branch, deploymentId } = job.data
      const buildStart = Date.now()

      const [service] = await db.select().from(services)
        .where(eq(services.id, serviceId))
        .limit(1)

      if (!service) throw new Error(`Service ${serviceId} not found`)
      if (!service.isActive) throw new Error('Service is not active')

      // Use existing deployment record (created by deploy endpoint) or create one
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

      await db.update(services).set({ status: 'building', updatedAt: new Date() })
        .where(eq(services.id, serviceId))

      // Header banner
      await log(deployment.id, `\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`, 'system')
      await log(deployment.id, `\x1b[1m  Highway Deployment\x1b[0m`, 'system')
      await log(deployment.id, `  Service:  ${service.name}`, 'system')
      await log(deployment.id, `  Repo:     ${service.gitRepoName ?? 'unknown'}`, 'system')
      await log(deployment.id, `  Branch:   ${branch ?? service.gitBranch ?? 'main'}`, 'system')
      await log(deployment.id, `  Trigger:  ${trigger}`, 'system')
      if (commitHash) await log(deployment.id, `  Commit:   ${commitHash.slice(0, 7)} ${commitMessage ?? ''}`, 'system')
      await log(deployment.id, `\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`, 'system')

      try {
        const imageName = await buildService.build(service, deployment)
        const buildDuration = Math.round((Date.now() - buildStart) / 1000)

        await db.update(deployments).set({
          imageName,
          buildDuration,
          status: 'deploying',
        }).where(eq(deployments.id, deployment.id))

        await log(deployment.id, step(`Build complete in ${buildDuration}s — starting deployment`), 'system')

        const envVars = await deployService.getDecryptedEnvVars(serviceId)

        await deployQueue.add('deploy', {
          serviceId,
          deploymentId: deployment.id,
          imageName,
          envVars,
        }, { priority: 1 })

      } catch (err) {
        const errMsg = (err as Error).message
        await db.update(deployments).set({
          status: 'failed',
          errorMessage: errMsg,
          finishedAt: new Date(),
        }).where(eq(deployments.id, deployment.id))

        await db.update(services).set({ status: 'error', updatedAt: new Date() })
          .where(eq(services.id, serviceId))

        await log(deployment.id, fail(`Build failed: ${errMsg}`), 'stderr')
        throw err
      }
    },
    { connection: queueConnection, concurrency: 3 }
  )

  worker.on('failed', (job, err) => console.error(`Build job ${job?.id} failed:`, err.message))
  worker.on('completed', (job) => console.log(`Build job ${job.id} completed`))

  return worker
}
