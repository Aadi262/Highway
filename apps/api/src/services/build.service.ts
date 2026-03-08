import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { docker } from '../lib/docker'
import { log } from './log.service'
import { DOCKER, LIMITS } from '@highway/shared'
import type { Service, Deployment } from '@highway/db'

// Unified 9-step pipeline (steps 1-5 = build, 6-9 = deploy)
const TOTAL = 9
const step = (n: number, msg: string) =>
  `\x1b[1m\x1b[36m[${n}/${TOTAL}]\x1b[0m \x1b[1m${msg}\x1b[0m`


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
  async build(service: Service, deployment: Deployment, envVars: Record<string, string> = {}): Promise<string> {
    const buildDir = join(DOCKER.BUILD_DIR, deployment.id)
    const imageName = `${DOCKER.IMAGE_PREFIX}/${service.slug}:${deployment.id.slice(0, 8)}`

    try {
      mkdirSync(buildDir, { recursive: true })

      // ── [1/9] Clone ───────────────────────────────────────────────────
      await log(deployment.id, step(1, `Cloning ${service.gitRepoName ?? 'repository'}@${service.gitBranch ?? 'main'}`), 'system')
      await this.cloneRepo(service, deployment, buildDir)
      await log(deployment.id, `\x1b[32m✓\x1b[0m Clone complete`, 'system')

      const sourceDir = service.gitRootDir && service.gitRootDir !== '/'
        ? join(buildDir, service.gitRootDir)
        : buildDir

      // Auto-detect Dockerfile
      let buildSystem = service.buildSystem ?? 'railpack'
      if (buildSystem === 'railpack') {
        const dockerfilePath = join(sourceDir, service.dockerfilePath ?? 'Dockerfile')
        if (existsSync(dockerfilePath)) {
          buildSystem = 'dockerfile'
          await log(deployment.id, `  Dockerfile detected — using Docker build`, 'system')
        }
      }

      // ── [2/9] Build ───────────────────────────────────────────────────
      if (buildSystem === 'dockerfile') {
        await log(deployment.id, step(2, 'Building Docker image'), 'system')
        await this.buildWithDockerfile(sourceDir, imageName, service, deployment)
      } else if (buildSystem === 'static') {
        await log(deployment.id, step(2, 'Installing dependencies'), 'system')
        await this.buildStaticSite(sourceDir, imageName, service, deployment)
      } else {
        await log(deployment.id, step(2, 'Detecting framework & generating build plan'), 'system')
        try {
          await this.buildWithRailpack(sourceDir, imageName, service, deployment, envVars)
        } catch (railpackErr) {
          // Railpack failed — fall back to auto-generated Dockerfile
          await log(deployment.id, `\x1b[33m⚠\x1b[0m Railpack build failed, falling back to Dockerfile build`, 'system')
          await log(deployment.id, `  Reason: ${(railpackErr as Error).message.slice(0, 200)}`, 'system')
          await log(deployment.id, step(3, 'Auto-generating Dockerfile'), 'system')
          await this.buildWithFallbackDockerfile(sourceDir, imageName, service, deployment)
        }
      }

      // ── [5/9] Image ready ─────────────────────────────────────────────
      await log(deployment.id, step(5, `Image ready: ${imageName}`), 'system')

      return imageName
    } catch (err) {
      await log(deployment.id, `\x1b[31m✗\x1b[0m Build failed: ${(err as Error).message}`, 'stderr')
      throw err
    } finally {
      try { rmSync(buildDir, { recursive: true, force: true }) } catch { }
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

    // Git clone writes progress to stderr — filter out percentage spam
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
        const trimmed = line.trim()
        if (!trimmed) continue
        // Skip noisy percentage progress lines
        if (/^remote: (Counting|Compressing) objects:/.test(trimmed)) continue
        if (/^Receiving objects:/.test(trimmed) && !trimmed.includes('done')) continue
        if (/^Resolving deltas:/.test(trimmed) && !trimmed.includes('done')) continue
        await log(deployment.id, trimmed, 'stdout')
      }
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) throw new Error(`Git clone failed: ${buf}`)
  },

  async buildWithRailpack(sourceDir: string, imageName: string, service: Service, deployment: Deployment, envVars: Record<string, string> = {}) {
    const args = ['railpack', 'build', sourceDir, '--name', imageName]
    if (service.startCommand) args.push('--start-cmd', service.startCommand)
    if (service.installCommand) args.push('--install-cmd', service.installCommand)
    // BuildKit layer caching — speeds up repeat builds (railpack uses --cache-key as a namespace)
    args.push('--cache-key', service.slug)
    // Pass env vars into build so frameworks like Next.js can access them at build time
    for (const [key, value] of Object.entries(envVars)) {
      args.push('--env', `${key}=${value}`)
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
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
      await log(deployment.id, step(3, 'Building application'), 'system')
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

    await log(deployment.id, step(4, 'Generating container image'), 'system')
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

  async buildWithFallbackDockerfile(sourceDir: string, imageName: string, service: Service, deployment: Deployment) {
    // Detect the project type from files present
    const hasPackageJson = existsSync(join(sourceDir, 'package.json'))
    const hasNextConfig = existsSync(join(sourceDir, 'next.config.js')) || existsSync(join(sourceDir, 'next.config.mjs')) || existsSync(join(sourceDir, 'next.config.ts'))
    const hasYarnLock = existsSync(join(sourceDir, 'yarn.lock'))
    const hasBunLock = existsSync(join(sourceDir, 'bun.lock')) || existsSync(join(sourceDir, 'bun.lockb'))
    const hasPnpmLock = existsSync(join(sourceDir, 'pnpm-lock.yaml'))
    const hasRequirements = existsSync(join(sourceDir, 'requirements.txt'))

    let dockerfileContent: string
    const port = service.port ?? 3000

    if (hasNextConfig && hasPackageJson) {
      await log(deployment.id, `  Detected: Next.js`, 'system')
      const pm = hasBunLock ? 'bun' : hasYarnLock ? 'yarn' : hasPnpmLock ? 'pnpm' : 'npm'
      const install = pm === 'bun' ? 'bun install --frozen-lockfile' : pm === 'yarn' ? 'yarn install --frozen-lockfile' : pm === 'pnpm' ? 'npm i -g pnpm && pnpm install --frozen-lockfile' : 'npm ci'
      const lockfile = pm === 'bun' ? 'bun.lock*' : pm === 'yarn' ? 'yarn.lock' : pm === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json*'
      dockerfileContent = `FROM node:20-alpine
WORKDIR /app
COPY package.json ${lockfile} ./
RUN ${install}
COPY . .
RUN npm run build
EXPOSE ${port}
ENV PORT=${port} NODE_ENV=production
CMD ["npm", "start"]`
    } else if (hasRequirements) {
      await log(deployment.id, `  Detected: Python`, 'system')
      dockerfileContent = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE ${port}
ENV PORT=${port}
CMD ["python", "app.py"]`
    } else if (hasPackageJson) {
      await log(deployment.id, `  Detected: Node.js`, 'system')
      const pm = hasBunLock ? 'bun' : hasYarnLock ? 'yarn' : hasPnpmLock ? 'pnpm' : 'npm'
      const install = pm === 'bun' ? 'bun install --frozen-lockfile' : pm === 'yarn' ? 'yarn install --frozen-lockfile' : pm === 'pnpm' ? 'npm i -g pnpm && pnpm install --frozen-lockfile' : 'npm ci'
      const lockfile = pm === 'bun' ? 'bun.lock*' : pm === 'yarn' ? 'yarn.lock' : pm === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json*'
      const startCmd = service.startCommand ?? 'npm start'
      dockerfileContent = `FROM node:20-alpine
WORKDIR /app
COPY package.json ${lockfile} ./
RUN ${install}
COPY . .
RUN npm run build 2>/dev/null || true
EXPOSE ${port}
ENV PORT=${port} NODE_ENV=production
CMD ${JSON.stringify(startCmd.split(' '))}`
    } else {
      throw new Error('Cannot detect project type — no package.json, requirements.txt, or Dockerfile found')
    }

    await log(deployment.id, step(4, 'Building container image from generated Dockerfile'), 'system')

    const dockerfilePath = join(sourceDir, 'Dockerfile.highway-fallback')
    await Bun.write(dockerfilePath, dockerfileContent)

    const tar = await import('tar-fs')
    const tarStream = tar.pack(sourceDir)
    const buildStream = await docker.buildImage(tarStream as any, {
      t: imageName,
      dockerfile: 'Dockerfile.highway-fallback',
    })

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
          if (line.startsWith('Step ') || line.startsWith('#')) {
            await log(deployment.id, `\x1b[1m${line}\x1b[0m`, 'stdout')
          } else {
            await log(deployment.id, line, 'stdout')
          }
        }
      )
    })

    await log(deployment.id, `\x1b[32m✓\x1b[0m Image built (fallback Dockerfile): ${imageName}`, 'system')
  },
}
