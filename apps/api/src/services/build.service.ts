import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { docker } from '../lib/docker'
import { log } from './log.service'
import { DOCKER, LIMITS } from '@highway/shared'
import type { Service, Deployment } from '@highway/db'

export const buildService = {
  async build(service: Service, deployment: Deployment): Promise<string> {
    const buildDir = join(DOCKER.BUILD_DIR, deployment.id)
    const imageName = `${DOCKER.IMAGE_PREFIX}/${service.slug}:${deployment.id.slice(0, 8)}`

    try {
      mkdirSync(buildDir, { recursive: true })

      // 1. Clone repo
      await log(deployment.id, `📦 Cloning ${service.gitRepoName}@${service.gitBranch ?? 'main'}...`)
      await this.cloneRepo(service, deployment, buildDir)
      await log(deployment.id, `✅ Clone complete`)

      // Source may be a subdirectory in a monorepo
      const sourceDir = service.gitRootDir && service.gitRootDir !== '/'
        ? join(buildDir, service.gitRootDir)
        : buildDir

      // 2. Build
      const buildSystem = service.buildSystem ?? 'railpack'
      if (buildSystem === 'dockerfile') {
        await this.buildWithDockerfile(sourceDir, imageName, service, deployment)
      } else if (buildSystem === 'static') {
        await this.buildStaticSite(sourceDir, imageName, service, deployment)
      } else {
        await this.buildWithRailpack(sourceDir, imageName, service, deployment)
      }

      return imageName
    } catch (err) {
      await log(deployment.id, `❌ Build failed: ${(err as Error).message}`)
      throw err
    } finally {
      try { rmSync(buildDir, { recursive: true, force: true }) } catch {}
    }
  },

  async cloneRepo(service: Service, deployment: Deployment, buildDir: string) {
    const branch = deployment.branch ?? service.gitBranch ?? 'main'
    const repoUrl = service.gitRepoUrl
    if (!repoUrl) throw new Error('No git repository configured')

    const proc = Bun.spawn(
      ['git', 'clone', '--depth', '1', '--branch', branch, repoUrl, buildDir],
      { stdout: 'pipe', stderr: 'pipe' }
    )

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text()
      throw new Error(`Git clone failed: ${errText}`)
    }
  },

  async buildWithRailpack(
    sourceDir: string,
    imageName: string,
    service: Service,
    deployment: Deployment
  ) {
    await log(deployment.id, `🔨 Building with Railpack...`)

    const args = ['railpack', 'build', sourceDir, '--name', imageName]
    if (service.startCommand) args.push('--start-cmd', service.startCommand)
    if (service.installCommand) args.push('--install-cmd', service.installCommand)

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
      },
    })

    // Stream output live
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    const buildStart = Date.now()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Check build timeout
      if (Date.now() - buildStart > LIMITS.BUILD_TIMEOUT_MS) {
        proc.kill()
        throw new Error('Build timed out after 30 minutes')
      }

      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        await log(deployment.id, line, 'stdout')
      }
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Railpack build failed (exit ${exitCode}): ${stderr.slice(0, 500)}`)
    }

    await log(deployment.id, `✅ Image built: ${imageName}`)
  },

  async buildWithDockerfile(
    sourceDir: string,
    imageName: string,
    service: Service,
    deployment: Deployment
  ) {
    await log(deployment.id, `🐳 Building with Dockerfile...`)

    const tar = await import('tar-fs')
    const dockerfilePath = service.dockerfilePath ?? 'Dockerfile'
    const context = service.dockerContext ?? './'

    const tarStream = tar.pack(join(sourceDir, context))

    const buildStream = await docker.buildImage(tarStream as any, {
      t: imageName,
      dockerfile: dockerfilePath,
      buildargs: {},
    })

    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: any) => (err ? reject(err) : resolve()),
        async (event: any) => {
          const line = event.stream?.trim() || event.error
          if (line) await log(deployment.id, line, event.error ? 'stderr' : 'stdout')
        }
      )
    })

    await log(deployment.id, `✅ Image built: ${imageName}`)
  },

  async buildStaticSite(
    sourceDir: string,
    imageName: string,
    service: Service,
    deployment: Deployment
  ) {
    await log(deployment.id, `⚡ Building static site...`)

    // Install deps + run build command
    if (service.installCommand) {
      await log(deployment.id, `📦 ${service.installCommand}`)
      const install = Bun.spawn(service.installCommand.split(' '), {
        cwd: sourceDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (await install.exited !== 0) {
        throw new Error('Install command failed')
      }
    }

    if (service.buildCommand) {
      await log(deployment.id, `🔨 ${service.buildCommand}`)
      const build = Bun.spawn(service.buildCommand.split(' '), {
        cwd: sourceDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (await build.exited !== 0) {
        throw new Error('Build command failed')
      }
    }

    // Wrap static output in nginx image
    const publishDir = service.publishDirectory ?? 'dist'
    const staticDir = join(sourceDir, publishDir)

    const dockerfileContent = `FROM nginx:alpine
COPY ${publishDir}/ /usr/share/nginx/html/
EXPOSE 80`

    await Bun.write(join(sourceDir, 'Dockerfile.highway-static'), dockerfileContent)

    const tar = await import('tar-fs')
    const tarStream = tar.pack(sourceDir)

    const buildStream = await docker.buildImage(tarStream as any, {
      t: imageName,
      dockerfile: 'Dockerfile.highway-static',
    })

    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: any) => (err ? reject(err) : resolve()),
        async (event: any) => {
          if (event.stream?.trim()) await log(deployment.id, event.stream.trim())
        }
      )
    })

    await log(deployment.id, `✅ Static site image built: ${imageName}`)
  },
}
