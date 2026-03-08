import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { docker } from '../lib/docker'
import { log } from './log.service'
import { DOCKER, LIMITS } from '@highway/shared'
import type { Service, Deployment } from '@highway/db'

const step = (n: number, total: number, msg: string) =>
  `\x1b[1m\x1b[36m[${n}/${total}]\x1b[0m \x1b[1m${msg}\x1b[0m`

async function streamProc(
  proc: ReturnType<typeof Bun.spawn>,
  deploymentId: string,
  stream: 'stdout' | 'stderr' = 'stdout'
) {
  if (!proc.stdout) return
  const reader = (proc.stdout as ReadableStream).getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value)
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) await log(deploymentId, line, stream)
    }
  }
  if (buf.trim()) await log(deploymentId, buf, stream)
}

export const buildService = {
  async build(service: Service, deployment: Deployment): Promise<string> {
    const buildDir = join(DOCKER.BUILD_DIR, deployment.id)
    const imageName = `${DOCKER.IMAGE_PREFIX}/${service.slug}:${deployment.id.slice(0, 8)}`
    const TOTAL_STEPS = service.buildSystem === 'dockerfile' ? 3 : 4

    try {
      mkdirSync(buildDir, { recursive: true })

      // ── Step 1: Clone ────────────────────────────────────────────────
      await log(deployment.id, step(1, TOTAL_STEPS, `Cloning ${service.gitRepoName ?? 'repository'}@${service.gitBranch ?? 'main'}`), 'system')
      await this.cloneRepo(service, deployment, buildDir)
      await log(deployment.id, `\x1b[32m✓\x1b[0m Clone complete`, 'system')

      const sourceDir = service.gitRootDir && service.gitRootDir !== '/'
        ? join(buildDir, service.gitRootDir)
        : buildDir

      // ── Step 2+: Build ───────────────────────────────────────────────
      const buildSystem = service.buildSystem ?? 'railpack'

      if (buildSystem === 'dockerfile') {
        await log(deployment.id, step(2, TOTAL_STEPS, 'Building Docker image'), 'system')
        await this.buildWithDockerfile(sourceDir, imageName, service, deployment)
      } else if (buildSystem === 'static') {
        await log(deployment.id, step(2, TOTAL_STEPS, 'Installing dependencies'), 'system')
        await this.buildStaticSite(sourceDir, imageName, service, deployment)
      } else {
        await log(deployment.id, step(2, TOTAL_STEPS, 'Detecting framework & generating build plan'), 'system')
        await this.buildWithRailpack(sourceDir, imageName, service, deployment)
      }

      await log(deployment.id, step(TOTAL_STEPS, TOTAL_STEPS, `Image ready: ${imageName}`), 'system')

      return imageName
    } catch (err) {
      await log(deployment.id, `\x1b[31m✗\x1b[0m Build failed: ${(err as Error).message}`, 'stderr')
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
      ['git', 'clone', '--depth', '1', '--branch', branch, '--progress', repoUrl, buildDir],
      { stdout: 'pipe', stderr: 'pipe' }
    )

    // Git clone writes progress to stderr
    const stderrReader = (proc.stderr as ReadableStream).getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await stderrReader.read()
      if (done) break
      buf += decoder.decode(value)
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) await log(deployment.id, line.trim(), 'stdout')
      }
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) throw new Error(`Git clone failed: ${buf}`)
  },

  async buildWithRailpack(sourceDir: string, imageName: string, service: Service, deployment: Deployment) {
    const args = ['railpack', 'build', sourceDir, '--name', imageName]
    if (service.startCommand) args.push('--start-cmd', service.startCommand)
    if (service.installCommand) args.push('--install-cmd', service.installCommand)

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit' },
    })

    const reader = (proc.stdout as ReadableStream).getReader()
    const decoder = new TextDecoder()
    const buildStart = Date.now()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (Date.now() - buildStart > LIMITS.BUILD_TIMEOUT_MS) {
        proc.kill()
        throw new Error('Build timed out after 30 minutes')
      }
      buf += decoder.decode(value)
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) await log(deployment.id, line, 'stdout')
      }
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr as ReadableStream).text()
      throw new Error(`Railpack build failed (exit ${exitCode}): ${stderr.slice(0, 500)}`)
    }

    await log(deployment.id, `\x1b[32m✓\x1b[0m Image built: ${imageName}`, 'system')
  },

  async buildWithDockerfile(sourceDir: string, imageName: string, service: Service, deployment: Deployment) {
    const tar = await import('tar-fs')
    const dockerfilePath = service.dockerfilePath ?? 'Dockerfile'
    const context = service.dockerContext ?? './'
    const tarStream = tar.pack(join(sourceDir, context))

    await log(deployment.id, `  Dockerfile: ${dockerfilePath}`, 'system')

    const buildStream = await docker.buildImage(tarStream as any, {
      t: imageName,
      dockerfile: dockerfilePath,
    })

    let step = ''
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: any) => (err ? reject(err) : resolve()),
        async (event: any) => {
          if (event.error) {
            await log(deployment.id, event.error.trim(), 'stderr')
            return
          }
          const line = event.stream?.trimEnd()
          if (!line) return
          // Highlight step lines
          if (line.startsWith('Step ') || line.startsWith('#')) {
            await log(deployment.id, `\x1b[1m${line}\x1b[0m`, 'stdout')
            step = line
          } else {
            await log(deployment.id, line, 'stdout')
          }
        }
      )
    })

    await log(deployment.id, `\x1b[32m✓\x1b[0m Image built: ${imageName}`, 'system')
  },

  async buildStaticSite(sourceDir: string, imageName: string, service: Service, deployment: Deployment) {
    if (service.installCommand) {
      await log(deployment.id, `  $ ${service.installCommand}`, 'system')
      const install = Bun.spawn(service.installCommand.split(' '), {
        cwd: sourceDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await streamProc(install, deployment.id)
      if (await install.exited !== 0) throw new Error('Install command failed')
      await log(deployment.id, `\x1b[32m✓\x1b[0m Install complete`, 'system')
    }

    if (service.buildCommand) {
      await log(deployment.id, `\x1b[1m\x1b[36m[3/4]\x1b[0m \x1b[1mRunning build command\x1b[0m`, 'system')
      await log(deployment.id, `  $ ${service.buildCommand}`, 'system')
      const build = Bun.spawn(service.buildCommand.split(' '), {
        cwd: sourceDir,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await streamProc(build, deployment.id)
      if (await build.exited !== 0) throw new Error('Build command failed')
      await log(deployment.id, `\x1b[32m✓\x1b[0m Build complete`, 'system')
    }

    const publishDir = service.publishDirectory ?? 'dist'
    const dockerfileContent = `FROM nginx:alpine\nCOPY ${publishDir}/ /usr/share/nginx/html/\nEXPOSE 80`
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
          const line = event.stream?.trim()
          if (line) await log(deployment.id, line)
        }
      )
    })

    await log(deployment.id, `\x1b[32m✓\x1b[0m Static site image built: ${imageName}`, 'system')
  },
}
