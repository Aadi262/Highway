import { dockerService } from './docker.service'
import { proxyService } from './proxy.service'
import { log } from './log.service'
import { db } from '../lib/db'
import { services, deployments } from '@highway/db'
import { eq } from 'drizzle-orm'
import { LIMITS } from '@highway/shared'
import type { Service, Deployment } from '@highway/db'

export const deployService = {
  async deploy(params: {
    service: Service
    deployment: Deployment
    imageName: string
    envVars: string[]
  }) {
    const { service, deployment, imageName, envVars } = params
    const deployStart = Date.now()

    await log(deployment.id, `🚀 Deploying ${service.name}...`)

    // 1. Ensure project-level Docker network
    const networkName = await dockerService.ensureProjectNetwork(
      await this.getProjectSlug(service.projectId)
    )

    // 2. Start new container (not yet in Caddy — blue/green pattern)
    await log(deployment.id, `📦 Starting container from image ${imageName}...`)
    const container = await dockerService.createContainer({
      service,
      deployment,
      imageName,
      envVars,
      networkName,
    })

    const containerInfo = await container.inspect()
    const newContainerId = containerInfo.Id
    await log(deployment.id, `✅ Container started: ${newContainerId.slice(0, 12)}`)

    // 3. Health check (if configured)
    if (service.healthCheckPath) {
      await log(deployment.id, `🏥 Waiting for health check on ${service.healthCheckPath}...`)
      const healthy = await dockerService.waitForHealthy(newContainerId, LIMITS.HEALTH_CHECK_TIMEOUT_MS)

      if (!healthy) {
        await dockerService.removeContainer(newContainerId, true)
        throw new Error('Health check failed — new container rolled back')
      }
      await log(deployment.id, `✅ Health check passed`)
    } else {
      // Small pause for app to start listening
      await Bun.sleep(3000)
    }

    // 4. Get container IP and update Caddy
    const containerIp = await dockerService.getContainerIp(newContainerId, networkName)
    if (containerIp && service.port) {
      await proxyService.updateServiceRoute(service, containerIp)
      await log(deployment.id, `🌐 Traffic routed to new container`)
    }

    // 5. Stop old container (graceful)
    const oldContainerId = service.containerId
    if (oldContainerId && oldContainerId !== newContainerId) {
      await log(deployment.id, `♻️ Stopping previous container...`)
      await dockerService.removeContainer(oldContainerId)
      await log(deployment.id, `✅ Previous container stopped`)
    }

    const deployDuration = Math.round((Date.now() - deployStart) / 1000)

    // 6. Update service record
    await db.update(services).set({
      containerId: newContainerId,
      containerName: containerInfo.Name.replace('/', ''),
      status: 'running',
      lastDeployedAt: new Date(),
      lastDeploymentId: deployment.id,
      updatedAt: new Date(),
    }).where(eq(services.id, service.id))

    // 7. Update deployment record
    await db.update(deployments).set({
      status: 'success',
      containerId: newContainerId,
      deployDuration,
      finishedAt: new Date(),
    }).where(eq(deployments.id, deployment.id))

    await log(deployment.id, `✅ Deployment complete in ${deployDuration}s!`)
  },

  async getProjectSlug(projectId: string): Promise<string> {
    const { projects } = await import('@highway/db')
    const [project] = await db.select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!project) throw new Error('Project not found')
    return project.slug
  },

  async rollback(serviceId: string, targetDeploymentId: string, userId: string) {
    const [target] = await db.select().from(deployments)
      .where(eq(deployments.id, targetDeploymentId))
      .limit(1)

    if (!target?.imageName) throw new Error('Target deployment has no image — cannot rollback')
    if (target.serviceId !== serviceId) throw new Error('Deployment does not belong to this service')

    const [service] = await db.select().from(services)
      .where(eq(services.id, serviceId))
      .limit(1)

    if (!service) throw new Error('Service not found')

    // Create a new deployment record marked as rollback
    const [rollbackDeploy] = await db.insert(deployments).values({
      serviceId,
      status: 'deploying',
      trigger: 'rollback',
      imageName: target.imageName,
      imageId: target.imageId,
      isRollback: true,
      rolledBackFrom: targetDeploymentId,
      commitHash: target.commitHash,
      commitMessage: `[Rollback] ${target.commitMessage ?? 'to previous version'}`,
      branch: target.branch,
      startedAt: new Date(),
    }).returning()

    // Queue the deploy directly (image already exists)
    const { deployQueue } = await import('../queue/queues')
    const envVars = await this.getDecryptedEnvVars(serviceId)

    await deployQueue.add('deploy', {
      serviceId,
      deploymentId: rollbackDeploy.id,
      imageName: target.imageName,
      envVars,
    })

    return rollbackDeploy
  },

  async getDecryptedEnvVars(serviceId: string): Promise<string[]> {
    const { envVars } = await import('@highway/db')
    const { decryptValue } = await import('../lib/encryption')
    const vars = await db.select().from(envVars).where(eq(envVars.serviceId, serviceId))
    return vars.map((v) => {
      const value = decryptValue({ encrypted: v.encryptedValue, iv: v.iv, authTag: v.authTag })
      return `${v.key}=${value}`
    })
  },
}
