import { dockerService } from './docker.service'
import { proxyService } from './proxy.service'
import { log } from './log.service'
import { db } from '../lib/db'
import { services, deployments } from '@highway/db'
import { eq } from 'drizzle-orm'
import { LIMITS } from '@highway/shared'
import type { Service, Deployment } from '@highway/db'

const step = (n: number, total: number, msg: string) =>
  `\x1b[1m\x1b[36m[${n}/${total}]\x1b[0m \x1b[1m${msg}\x1b[0m`
const ok = (msg: string) => `\x1b[32m✓\x1b[0m ${msg}`
const fail = (msg: string) => `\x1b[31m✗\x1b[0m ${msg}`
const info = (msg: string) => `\x1b[2m${msg}\x1b[0m`

const TOTAL = 5

export const deployService = {
  async deploy(params: {
    service: Service
    deployment: Deployment
    imageName: string
    envVars: string[]
  }) {
    const { service, deployment, imageName, envVars } = params
    const deployStart = Date.now()

    // 1. Ensure project-level Docker network
    await log(deployment.id, step(1, TOTAL, 'Setting up project network'))
    const networkName = await dockerService.ensureProjectNetwork(
      await this.getProjectSlug(service.projectId)
    )
    await log(deployment.id, ok(`Network ready: ${networkName}`))

    // 2. Start new container
    await log(deployment.id, step(2, TOTAL, `Creating container from ${imageName.split(':')[1] ?? imageName}`))
    await log(deployment.id, info(`  Image:   ${imageName}`))
    await log(deployment.id, info(`  Port:    ${service.port ?? 3000}`))
    await log(deployment.id, info(`  Memory:  ${service.memoryLimitMb ?? 512}MB`))

    const container = await dockerService.createContainer({
      service,
      deployment,
      imageName,
      envVars,
      networkName,
    })

    const containerInfo = await container.inspect()
    const newContainerId = containerInfo.Id
    await log(deployment.id, ok(`Container started: ${newContainerId.slice(0, 12)}`))

    // 3. Health check
    await log(deployment.id, step(3, TOTAL, 'Running health check'))
    if (service.healthCheckPath) {
      await log(deployment.id, info(`  Path: ${service.healthCheckPath}`))
      const healthy = await dockerService.waitForHealthy(newContainerId, LIMITS.HEALTH_CHECK_TIMEOUT_MS)
      if (!healthy) {
        // Capture container logs before removing
        try {
          const ctr = dockerService.docker.getContainer(newContainerId)
          const logStream = await ctr.logs({ stdout: true, stderr: true, tail: 20 })
          const logsText = logStream.toString()
          if (logsText.trim()) {
            await log(deployment.id, `\x1b[31mContainer output:\x1b[0m`)
            for (const line of logsText.split('\n').filter(Boolean)) {
              await log(deployment.id, `  ${line}`, 'stderr')
            }
          }
        } catch {}
        await dockerService.removeContainer(newContainerId, true)
        throw new Error(`Health check failed after ${LIMITS.HEALTH_CHECK_TIMEOUT_MS / 1000}s — container rolled back`)
      }
      await log(deployment.id, ok('Health check passed'))
    } else {
      await log(deployment.id, info('  No health check configured — waiting 3s for startup'))
      await Bun.sleep(3000)
      await log(deployment.id, ok('Container ready'))
    }

    // 4. Update Caddy route
    await log(deployment.id, step(4, TOTAL, 'Updating reverse proxy'))
    const containerIp = await dockerService.getContainerIp(newContainerId, networkName)
    if (containerIp && service.port) {
      await proxyService.updateServiceRoute(service, containerIp)
      const domain = service.autoDomain ?? `${service.slug}.${process.env.PLATFORM_DOMAIN}`
      await log(deployment.id, ok(`Traffic routed → ${containerIp}:${service.port}`))
      await log(deployment.id, info(`  URL: http://${domain}`))
    } else {
      await log(deployment.id, info('  No port configured — skipping Caddy route'))
    }

    // 5. Stop old container
    await log(deployment.id, step(5, TOTAL, 'Cleaning up old container'))
    const oldContainerId = service.containerId
    if (oldContainerId && oldContainerId !== newContainerId) {
      await dockerService.removeContainer(oldContainerId)
      await log(deployment.id, ok(`Stopped previous container ${oldContainerId.slice(0, 12)}`))
    } else {
      await log(deployment.id, info('  No previous container to stop'))
    }

    const deployDuration = Math.round((Date.now() - deployStart) / 1000)

    // Update DB records
    await db.update(services).set({
      containerId: newContainerId,
      containerName: containerInfo.Name.replace('/', ''),
      status: 'running',
      lastDeployedAt: new Date(),
      lastDeploymentId: deployment.id,
      updatedAt: new Date(),
    }).where(eq(services.id, service.id))

    await db.update(deployments).set({
      status: 'success',
      containerId: newContainerId,
      deployDuration,
      finishedAt: new Date(),
    }).where(eq(deployments.id, deployment.id))

    const domain = service.autoDomain ?? `${service.slug}.${process.env.PLATFORM_DOMAIN}`
    await log(deployment.id, `\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)
    await log(deployment.id, `\x1b[32m\x1b[1m✓ Deployment complete in ${deployDuration}s\x1b[0m`)
    await log(deployment.id, `\x1b[1m  Live at: http://${domain}\x1b[0m`)
    await log(deployment.id, `\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)
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

  async rollback(serviceId: string, targetDeploymentId: string, _userId: string) {
    const [target] = await db.select().from(deployments)
      .where(eq(deployments.id, targetDeploymentId))
      .limit(1)

    if (!target?.imageName) throw new Error('Target deployment has no image — cannot rollback')
    if (target.serviceId !== serviceId) throw new Error('Deployment does not belong to this service')

    const [service] = await db.select().from(services)
      .where(eq(services.id, serviceId))
      .limit(1)

    if (!service) throw new Error('Service not found')

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
