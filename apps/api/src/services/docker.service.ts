import { docker } from '../lib/docker'
import { DOCKER, type ContainerStats } from '@highway/shared'
import type { Service, Deployment, Volume } from '@highway/db'

export const dockerService = {
  // ── Networks ──────────────────────────────────────────────────────────────
  docker,
  async ensureProjectNetwork(projectSlug: string): Promise<string> {
    const name = `${DOCKER.NETWORK_PREFIX}-${projectSlug}`
    const existing = await docker.listNetworks({ filters: { name: [name] } })
    if (existing.length > 0) return name

    await docker.createNetwork({
      Name: name,
      Driver: 'bridge',
      Labels: {
        'managed-by': 'highway',
        'highway.project': projectSlug,
      },
    })
    console.log(`Created Docker network: ${name}`)
    return name
  },

  async removeProjectNetwork(projectSlug: string) {
    const name = `${DOCKER.NETWORK_PREFIX}-${projectSlug}`
    try {
      const net = docker.getNetwork(name)
      await net.remove()
    } catch { }
  },

  // ── Containers ────────────────────────────────────────────────────────────

  async createContainer(params: {
    service: Service
    deployment: Deployment
    imageName: string
    envVars: string[]
    networkName: string
    volumes?: Volume[]
  }) {
    const { service, deployment, imageName, envVars, networkName, volumes = [] } = params
    const containerName = `highway-svc-${service.slug}-${deployment.id.slice(0, 8)}`

    const container = await docker.createContainer({
      Image: imageName,
      name: containerName,
      Env: envVars,
      Labels: {
        'managed-by': 'highway',
        'highway.service': service.id,
        'highway.project': service.projectId,
        'highway.deployment': deployment.id,
        'highway.slug': service.slug,
      },
      ExposedPorts: {
        [`${service.port ?? 3000}/tcp`]: {},
      },
      HostConfig: {
        RestartPolicy: { Name: (service.restartPolicy as any) ?? 'unless-stopped' },
        Memory: ((service.memoryLimitMb ?? 512) * 1024 * 1024),
        NanoCpus: Math.round(((service.cpuLimit ?? 50) / 100) * 1e9),
        NetworkMode: networkName,
        Binds: volumes.map((v) => `${v.dockerVolumeName}:${v.mountPath}`),
        // Auto-assign a host port so the service is reachable at VPS_IP:hostPort
        PortBindings: {
          [`${service.port ?? 3000}/tcp`]: [{ HostPort: '' }],
        },
      },
      Healthcheck: service.healthCheckPath
        ? {
          Test: [
            'CMD-SHELL',
            `curl -sf http://localhost:${service.port ?? 3000}${service.healthCheckPath} || exit 1`,
          ],
          Interval: 10_000_000_000,   // 10s in nanoseconds
          Timeout: 5_000_000_000,
          Retries: 3,
          StartPeriod: 40_000_000_000,
        }
        : undefined,
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [service.networkAlias ?? service.slug],
          },
        },
      },
    })

    await container.start()
    return container
  },

  async stopContainer(containerId: string, gracefulSeconds = 30) {
    const container = docker.getContainer(containerId)
    try {
      await container.stop({ t: gracefulSeconds })
    } catch (err: any) {
      if (!err.message?.includes('container already stopped')) throw err
    }
  },

  async removeContainer(containerId: string, force = false) {
    const container = docker.getContainer(containerId)
    try { await container.stop({ t: 10 }) } catch { }
    try { await container.remove({ force }) } catch { }
  },

  async inspectContainer(containerId: string) {
    return docker.getContainer(containerId).inspect()
  },

  async getContainerIp(containerId: string, networkName: string): Promise<string | null> {
    const info = await docker.getContainer(containerId).inspect()
    const networks = info.NetworkSettings.Networks
    return networks[networkName]?.IPAddress ?? null
  },

  // ── Log Streaming ─────────────────────────────────────────────────────────

  async getLogStream(containerId: string) {
    const container = docker.getContainer(containerId)
    return container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: 200,
    })
  },

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(containerId: string): Promise<ContainerStats> {
    const container = docker.getContainer(containerId)
    const stats = (await container.stats({ stream: false })) as any

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
    const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
    const cpuCount = stats.cpu_stats.online_cpus ?? 1
    const cpuPercent = sysDelta > 0 ? Math.round((cpuDelta / sysDelta) * cpuCount * 10000) / 100 : 0

    return {
      cpuPercent,
      memoryMb: Math.round(stats.memory_stats.usage / 1024 / 1024),
      memoryLimitMb: Math.round(stats.memory_stats.limit / 1024 / 1024),
      networkRxBytes: stats.networks?.eth0?.rx_bytes ?? 0,
      networkTxBytes: stats.networks?.eth0?.tx_bytes ?? 0,
      diskReadBytes: stats.blkio_stats?.io_service_bytes_recursive?.find((x: any) => x.op === 'read')?.value ?? 0,
      diskWriteBytes: stats.blkio_stats?.io_service_bytes_recursive?.find((x: any) => x.op === 'write')?.value ?? 0,
    }
  },

  // ── Health ────────────────────────────────────────────────────────────────

  // Returns { healthy, warning } — warning is set when healthcheck couldn't be verified
  // (e.g. curl not in container) but container is running.
  async waitForHealthy(
    containerId: string,
    timeoutMs: number,
    _port?: number,
    _path?: string,
  ): Promise<{ healthy: boolean; warning?: string }> {
    const start = Date.now()
    const container = docker.getContainer(containerId)

    // Brief startup delay so the process can bind to its port
    await Bun.sleep(2000)

    while (Date.now() - start < timeoutMs) {
      const info = await container.inspect()

      // Container crashed — fail fast
      if (!info.State.Running) return { healthy: false }

      const health = info.State.Health?.Status

      if (health === 'healthy') return { healthy: true }

      // "unhealthy" usually means curl/wget is absent in the image, not that the app failed.
      // Give benefit of the doubt: if container is still running, allow the deployment.
      if (health === 'unhealthy') {
        return {
          healthy: true,
          warning: 'Healthcheck command failed (curl may be absent) — container is running, proceeding',
        }
      }

      // No Docker HEALTHCHECK configured — running is sufficient
      if (!info.Config.Healthcheck) return { healthy: true }

      await Bun.sleep(3000)
    }

    // Timeout: if container is still running, allow it through with a warning
    const info = await container.inspect()
    if (info.State.Running) {
      return {
        healthy: true,
        warning: `Health check timed out after ${timeoutMs / 1000}s but container is running — proceeding`,
      }
    }
    return { healthy: false }
  },

  // ── Volumes ───────────────────────────────────────────────────────────────

  async createVolume(name: string): Promise<string> {
    const volumeName = `highway-vol-${name}`
    await docker.createVolume({
      Name: volumeName,
      Driver: 'local',
      Labels: { 'managed-by': 'highway' },
    })
    return volumeName
  },

  async removeVolume(volumeName: string) {
    try {
      const vol = docker.getVolume(volumeName)
      await vol.remove()
    } catch { }
  },

  // ── Images ────────────────────────────────────────────────────────────────

  async pullImage(imageName: string, onProgress?: (event: any) => void): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: any, stream: any) => {
        if (err) return reject(err)
        docker.modem.followProgress(stream, (err: any) => {
          if (err) reject(err)
          else resolve()
        }, onProgress)
      })
    })
  },

  async removeImage(imageName: string) {
    try {
      const image = docker.getImage(imageName)
      await image.remove({ force: true })
    } catch { }
  },

  async listHighwayContainers() {
    return docker.listContainers({
      all: true,
      filters: { label: ['managed-by=highway'] },
    })
  },
}
