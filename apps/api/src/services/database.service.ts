import { randomBytes } from 'crypto'
import { docker } from '../lib/docker'
import { dockerService } from './docker.service'
import { DB_CONFIG, type DbEngine } from '@highway/shared'
import { encryptValue } from '../lib/encryption'
import { db } from '../lib/db'
import { databaseServices } from '@highway/db'
import { eq } from 'drizzle-orm'

export const databaseService = {
  async provision(params: {
    name: string
    engine: DbEngine
    projectId: string
    projectSlug: string
    memoryLimitMb?: number
  }) {
    const { name, engine, projectId, projectSlug, memoryLimitMb } = params
    const cfg = DB_CONFIG[engine]
    const password = randomBytes(24).toString('hex')
    const dbName = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const slug = dbName
    const containerName = `highway-db-${projectSlug}-${slug}`
    const volumeName = `highway-db-${projectSlug}-${slug}-data`
    const networkName = `highway-${projectSlug}`

    // Ensure network exists
    await dockerService.ensureProjectNetwork(projectSlug)

    // Pull image
    await dockerService.pullImage(cfg.image)

    // Create persistent volume
    await docker.createVolume({ Name: volumeName, Driver: 'local', Labels: { 'managed-by': 'highway' } })

    // Build env vars for engine
    const env = this.buildEnv(engine, password, dbName)

    // Create container
    const container = await docker.createContainer({
      Image: cfg.image,
      name: containerName,
      Env: env,
      Labels: {
        'managed-by': 'highway',
        'highway.database': engine,
        'highway.project': projectSlug,
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: (memoryLimitMb ?? cfg.defaultMemoryMb) * 1024 * 1024,
        NetworkMode: networkName,
        Binds: [`${volumeName}:${cfg.dataDir}`],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [containerName, slug],
          },
        },
      },
    })

    await container.start()

    // Encrypt password for storage
    const encrypted = encryptValue(password)

    // Internal host is the Docker container name (DNS in network)
    const internalHost = containerName
    const connectionString = this.buildConnectionString(engine, internalHost, password, dbName)

    // Store in DB
    const [dbRecord] = await db.insert(databaseServices).values({
      projectId,
      name,
      slug,
      type: engine,
      status: 'running',
      containerId: container.id,
      containerName,
      dockerVolumeName: volumeName,
      host: internalHost,
      port: cfg.port,
      dbName,
      username: this.getUsername(engine, dbName),
      encryptedPassword: encrypted.encrypted,
      passwordIv: encrypted.iv,
      passwordAuthTag: encrypted.authTag,
      // Store connection string without password for display
      connectionString: this.buildRedactedConnectionString(engine, internalHost, dbName),
      memoryLimitMb: memoryLimitMb ?? cfg.defaultMemoryMb,
    }).returning()

    return {
      dbRecord,
      password,          // Returned once — user must save this
      connectionString,  // Full string with password
      individualVars: this.buildIndividualVars(engine, internalHost, password, dbName),
    }
  },

  buildEnv(engine: DbEngine, password: string, dbName: string): string[] {
    switch (engine) {
      case 'postgres':
        return [`POSTGRES_USER=${dbName}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DB=${dbName}`]
      case 'mysql':
        return [`MYSQL_ROOT_PASSWORD=${password}`, `MYSQL_DATABASE=${dbName}`, `MYSQL_USER=${dbName}`, `MYSQL_PASSWORD=${password}`]
      case 'mongodb':
        return [`MONGO_INITDB_ROOT_USERNAME=root`, `MONGO_INITDB_ROOT_PASSWORD=${password}`, `MONGO_INITDB_DATABASE=${dbName}`]
      case 'redis':
        return [`REDIS_PASSWORD=${password}`]
      case 'mariadb':
        return [`MARIADB_ROOT_PASSWORD=${password}`, `MARIADB_DATABASE=${dbName}`, `MARIADB_USER=${dbName}`, `MARIADB_PASSWORD=${password}`]
    }
  },

  getUsername(engine: DbEngine, dbName: string): string {
    switch (engine) {
      case 'mongodb': return 'root'
      case 'redis': return ''
      default: return dbName
    }
  },

  buildConnectionString(engine: DbEngine, host: string, password: string, dbName: string): string {
    const port = DB_CONFIG[engine].port
    switch (engine) {
      case 'postgres':  return `postgresql://${dbName}:${password}@${host}:${port}/${dbName}`
      case 'mysql':     return `mysql://${dbName}:${password}@${host}:${port}/${dbName}`
      case 'mongodb':   return `mongodb://root:${password}@${host}:${port}/${dbName}?authSource=admin`
      case 'redis':     return `redis://:${password}@${host}:${port}`
      case 'mariadb':   return `mysql://${dbName}:${password}@${host}:${port}/${dbName}`
    }
  },

  buildRedactedConnectionString(engine: DbEngine, host: string, dbName: string): string {
    const port = DB_CONFIG[engine].port
    switch (engine) {
      case 'postgres':  return `postgresql://${dbName}:***@${host}:${port}/${dbName}`
      case 'mysql':     return `mysql://${dbName}:***@${host}:${port}/${dbName}`
      case 'mongodb':   return `mongodb://root:***@${host}:${port}/${dbName}?authSource=admin`
      case 'redis':     return `redis://:***@${host}:${port}`
      case 'mariadb':   return `mysql://${dbName}:***@${host}:${port}/${dbName}`
    }
  },

  buildIndividualVars(engine: DbEngine, host: string, password: string, dbName: string): Record<string, string> {
    const port = String(DB_CONFIG[engine].port)
    return {
      DB_HOST: host,
      DB_PORT: port,
      DB_USER: this.getUsername(engine, dbName),
      DB_PASSWORD: password,
      DB_NAME: dbName,
      DATABASE_URL: this.buildConnectionString(engine, host, password, dbName),
    }
  },

  async getPassword(dbId: string): Promise<string> {
    const { decryptValue } = await import('../lib/encryption')
    const [record] = await db.select({
      encryptedPassword: databaseServices.encryptedPassword,
      passwordIv: databaseServices.passwordIv,
      passwordAuthTag: databaseServices.passwordAuthTag,
    }).from(databaseServices).where(eq(databaseServices.id, dbId)).limit(1)

    if (!record?.encryptedPassword || !record.passwordIv || !record.passwordAuthTag) {
      throw new Error('No credentials found')
    }

    return decryptValue({
      encrypted: record.encryptedPassword,
      iv: record.passwordIv,
      authTag: record.passwordAuthTag,
    })
  },

  async stop(dbId: string) {
    const [record] = await db.select().from(databaseServices).where(eq(databaseServices.id, dbId)).limit(1)
    if (!record?.containerId) return
    const container = docker.getContainer(record.containerId)
    try { await container.stop({ t: 30 }) } catch {}
    await db.update(databaseServices).set({ status: 'stopped', updatedAt: new Date() }).where(eq(databaseServices.id, dbId))
  },

  async start(dbId: string) {
    const [record] = await db.select().from(databaseServices).where(eq(databaseServices.id, dbId)).limit(1)
    if (!record?.containerId) return
    const container = docker.getContainer(record.containerId)
    await container.start()
    await db.update(databaseServices).set({ status: 'running', updatedAt: new Date() }).where(eq(databaseServices.id, dbId))
  },

  async remove(dbId: string) {
    const [record] = await db.select().from(databaseServices).where(eq(databaseServices.id, dbId)).limit(1)
    if (!record) return
    if (record.containerId) {
      await dockerService.removeContainer(record.containerId, true)
    }
    if (record.dockerVolumeName) {
      await dockerService.removeVolume(record.dockerVolumeName)
    }
    await db.delete(databaseServices).where(eq(databaseServices.id, dbId))
  },
}
