// ─── Platform Limits ─────────────────────────────────────────────────────────
export const LIMITS = {
  MAX_SERVICES_PER_PROJECT: 20,
  MAX_PROJECTS_PER_USER: 50,
  MAX_ENV_VARS_PER_SERVICE: 100,
  MAX_DOMAINS_PER_SERVICE: 10,
  MAX_VOLUMES_PER_SERVICE: 5,
  MAX_LOG_LINES_BUFFERED: 1000,
  BUILD_TIMEOUT_MS: 30 * 60 * 1000,   // 30 minutes
  DEPLOY_TIMEOUT_MS: 10 * 60 * 1000,  // 10 minutes
  HEALTH_CHECK_TIMEOUT_MS: 2 * 60 * 1000,
  METRICS_RETENTION_DAYS: 7,
} as const

// ─── Redis Key Patterns ──────────────────────────────────────────────────────
export const REDIS_KEYS = {
  logBuffer: (id: string) => `highway:logs:${id}`,
  logChannel: (id: string) => `highway:logs:stream:${id}`,
  session: (token: string) => `highway:session:${token}`,
  rateLimit: (ip: string, route: string) => `highway:rl:${ip}:${route}`,
  metricsCache: (serviceId: string) => `highway:metrics:${serviceId}`,
} as const

// ─── Queue Names ─────────────────────────────────────────────────────────────
export const QUEUES = {
  BUILD: 'highway:queue:build',
  DEPLOY: 'highway:queue:deploy',
  HEALTH_CHECK: 'highway:queue:healthcheck',
  CLEANUP: 'highway:queue:cleanup',
  METRICS: 'highway:queue:metrics',
} as const

// ─── Docker ──────────────────────────────────────────────────────────────────
export const DOCKER = {
  SOCKET_PATH: '/var/run/docker.sock',
  NETWORK_PREFIX: 'highway',
  CONTAINER_LABEL: 'managed-by=highway',
  BUILD_DIR: '/tmp/highway-builds',
  IMAGE_PREFIX: 'highway',
} as const

// ─── Caddy ───────────────────────────────────────────────────────────────────
export const CADDY = {
  ADMIN_API: 'http://localhost:2019',
  ROUTE_ID_PREFIX: 'highway-',
} as const

// ─── Database Engine Defaults ─────────────────────────────────────────────────
export const DB_CONFIG = {
  postgres: { image: 'postgres:16-alpine', port: 5432, dataDir: '/var/lib/postgresql/data', defaultMemoryMb: 512 },
  mysql: { image: 'mysql:8.4', port: 3306, dataDir: '/var/lib/mysql', defaultMemoryMb: 512 },
  mongodb: { image: 'mongo:7', port: 27017, dataDir: '/data/db', defaultMemoryMb: 512 },
  redis: { image: 'redis:7-alpine', port: 6379, dataDir: '/data', defaultMemoryMb: 256 },
  mariadb: { image: 'mariadb:11', port: 3306, dataDir: '/var/lib/mysql', defaultMemoryMb: 512 },
} as const

export type DbEngine = keyof typeof DB_CONFIG
