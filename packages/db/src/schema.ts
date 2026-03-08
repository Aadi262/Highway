import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
  bigint,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const serviceTypeEnum = pgEnum('service_type', ['web', 'worker', 'cron'])
export const deploymentStatusEnum = pgEnum('deployment_status', ['queued', 'building', 'deploying', 'success', 'failed', 'cancelled'])
export const deploymentTriggerEnum = pgEnum('deployment_trigger', ['push', 'manual', 'api', 'redeploy', 'rollback'])
export const databaseTypeEnum = pgEnum('database_type', ['postgresql', 'mysql', 'mongodb', 'redis', 'mariadb'])
export const domainTypeEnum = pgEnum('domain_type', ['auto', 'custom'])
export const sslStatusEnum = pgEnum('ssl_status', ['pending', 'provisioning', 'active', 'expired', 'failed'])
export const buildSystemEnum = pgEnum('build_system', ['railpack', 'dockerfile', 'static'])
export const serviceStatusEnum = pgEnum('service_status', ['idle', 'building', 'running', 'stopped', 'error', 'crashed'])

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: text('github_id').notNull(),
  username: text('username').notNull(),
  email: text('email'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  githubAccessToken: text('github_access_token').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  githubIdIdx: uniqueIndex('users_github_id_idx').on(t.githubId),
  usernameIdx: index('users_username_idx').on(t.username),
}))

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  // Docker network for this project (project-level isolation)
  dockerNetwork: text('docker_network'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('projects_user_id_idx').on(t.userId),
  slugIdx: uniqueIndex('projects_slug_idx').on(t.userId, t.slug),
}))

// ─── Services ────────────────────────────────────────────────────────────────

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: serviceTypeEnum('type').notNull().default('web'),
  status: serviceStatusEnum('status').notNull().default('idle'),

  // GitHub source
  gitRepoId: text('git_repo_id'),       // GitHub repo ID (numeric, as string)
  gitRepoUrl: text('git_repo_url'),     // https://github.com/owner/repo
  gitRepoName: text('git_repo_name'),   // owner/repo
  gitBranch: text('git_branch').default('main'),
  gitRootDir: text('git_root_dir').default('/'), // monorepo subdirectory

  // Build config
  buildSystem: buildSystemEnum('build_system').default('railpack'),
  buildCommand: text('build_command'),
  startCommand: text('start_command'),
  installCommand: text('install_command'),
  dockerfilePath: text('dockerfile_path').default('Dockerfile'),
  dockerContext: text('docker_context').default('./'),
  publishDirectory: text('publish_directory'),

  // Network
  port: integer('port').default(3000),
  internalUrl: text('internal_url'),   // http://service-name.project-slug.internal
  networkAlias: text('network_alias'),  // Docker DNS alias within project network

  // Domains (auto-generated + custom)
  autoDomain: text('auto_domain'),      // service-slug.platform.domain
  caddyRouteId: text('caddy_route_id'),

  // Resource limits
  cpuLimit: integer('cpu_limit').default(50),        // percentage (50 = 0.5 cores)
  memoryLimitMb: integer('memory_limit_mb').default(512),
  restartPolicy: text('restart_policy').default('unless-stopped'),

  // Health check
  healthCheckPath: text('health_check_path'),
  healthCheckInterval: integer('health_check_interval').default(30),

  // GitHub webhook
  githubWebhookId: text('github_webhook_id'),
  autoDeploy: boolean('auto_deploy').default(true),

  // Docker runtime
  containerId: text('container_id'),
  containerName: text('container_name'),

  // Latest deploy info
  lastDeployedAt: timestamp('last_deployed_at'),
  lastDeploymentId: uuid('last_deployment_id'),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  projectIdIdx: index('services_project_id_idx').on(t.projectId),
  gitRepoIdx: index('services_git_repo_idx').on(t.gitRepoId),
  slugIdx: uniqueIndex('services_slug_idx').on(t.projectId, t.slug),
}))

// ─── Environment Variables ────────────────────────────────────────────────────

export const envVars = pgTable('env_vars', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  isSecret: boolean('is_secret').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  serviceIdx: index('env_vars_service_idx').on(t.serviceId),
  uniqueKey: uniqueIndex('env_vars_unique_key_idx').on(t.serviceId, t.key),
}))

// ─── Database Services ───────────────────────────────────────────────────────

export const databaseServices = pgTable('database_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: databaseTypeEnum('type').notNull(),
  status: serviceStatusEnum('status').notNull().default('idle'),

  // Docker runtime
  containerId: text('container_id'),
  containerName: text('container_name'),
  dockerVolumeName: text('docker_volume_name'),

  // Connection details (encrypted password stored separately)
  host: text('host'),        // internal Docker DNS
  port: integer('port'),
  dbName: text('db_name'),
  username: text('username'),
  encryptedPassword: text('encrypted_password'),
  passwordIv: text('password_iv'),
  passwordAuthTag: text('password_auth_tag'),
  connectionString: text('connection_string'), // non-sensitive portion only

  // Resource limits
  memoryLimitMb: integer('memory_limit_mb').default(512),

  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  projectIdIdx: index('db_services_project_id_idx').on(t.projectId),
}))

// ─── Deployments ─────────────────────────────────────────────────────────────

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),

  status: deploymentStatusEnum('status').notNull().default('queued'),
  trigger: deploymentTriggerEnum('trigger').notNull().default('manual'),

  // Git info
  commitHash: text('commit_hash'),
  commitMessage: text('commit_message'),
  commitAuthor: text('commit_author'),
  branch: text('branch'),

  // Docker image
  imageName: text('image_name'),
  imageId: text('image_id'),
  containerId: text('container_id'),

  // Timing
  buildDuration: integer('build_duration'),   // seconds
  deployDuration: integer('deploy_duration'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),

  // Rollback info
  isRollback: boolean('is_rollback').default(false),
  rolledBackFrom: uuid('rolled_back_from'),

  errorMessage: text('error_message'),
}, (t) => ({
  serviceIdIdx: index('deployments_service_id_idx').on(t.serviceId),
  statusIdx: index('deployments_status_idx').on(t.status),
  createdAtIdx: index('deployments_created_at_idx').on(t.createdAt),
}))

// ─── Domains ────────────────────────────────────────────────────────────────

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  type: domainTypeEnum('type').notNull().default('custom'),
  sslStatus: sslStatusEnum('ssl_status').notNull().default('pending'),
  sslExpiresAt: timestamp('ssl_expires_at'),
  caddyRouteId: text('caddy_route_id'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  hostnameIdx: uniqueIndex('domains_hostname_idx').on(t.hostname),
  serviceIdx: index('domains_service_idx').on(t.serviceId),
}))

// ─── Metrics ─────────────────────────────────────────────────────────────────

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  cpuPercent: integer('cpu_percent'),           // e.g., 1250 = 12.50%
  memoryMb: integer('memory_mb'),
  memoryLimitMb: integer('memory_limit_mb'),
  networkRxBytes: bigint('network_rx_bytes', { mode: 'bigint' }),
  networkTxBytes: bigint('network_tx_bytes', { mode: 'bigint' }),
  diskReadBytes: bigint('disk_read_bytes', { mode: 'bigint' }),
  diskWriteBytes: bigint('disk_write_bytes', { mode: 'bigint' }),
}, (t) => ({
  serviceTimeIdx: index('metrics_service_time_idx').on(t.serviceId, t.timestamp),
}))

// ─── Volumes ────────────────────────────────────────────────────────────────

export const volumes = pgTable('volumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mountPath: text('mount_path').notNull(),
  sizeGb: integer('size_gb').default(1),
  dockerVolumeName: text('docker_volume_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  serviceIdx: index('volumes_service_idx').on(t.serviceId),
}))

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),          // 'service.created', 'deployment.triggered'
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  resourceIdx: index('audit_resource_idx').on(t.resourceType, t.resourceId),
  userIdx: index('audit_user_idx').on(t.userId),
}))

// ─── Templates ───────────────────────────────────────────────────────────────

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  icon: text('icon'),
  category: text('category').notNull(),     // 'framework', 'database', 'cms', 'tool'
  servicesConfig: jsonb('services_config').notNull().$type<TemplateServiceConfig[]>(),
  defaultEnvVars: jsonb('default_env_vars').$type<Record<string, string>>(),
  isOfficial: boolean('is_official').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── Deployment Logs ─────────────────────────────────────────────────────────

export const deploymentLogs = pgTable('deployment_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  stream: text('stream').notNull().default('stdout'), // 'stdout' | 'stderr' | 'system'
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (t) => ({
  deploymentIdIdx: index('deployment_logs_deployment_id_idx').on(t.deploymentId),
  deploymentTimeIdx: index('deployment_logs_deployment_time_idx').on(t.deploymentId, t.timestamp),
}))

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  auditLogs: many(auditLogs),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  services: many(services),
  databases: many(databaseServices),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  project: one(projects, { fields: [services.projectId], references: [projects.id] }),
  deployments: many(deployments),
  envVars: many(envVars),
  domains: many(domains),
  metrics: many(metrics),
  volumes: many(volumes),
}))

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  service: one(services, { fields: [deployments.serviceId], references: [services.id] }),
  logs: many(deploymentLogs),
}))

export const deploymentLogsRelations = relations(deploymentLogs, ({ one }) => ({
  deployment: one(deployments, { fields: [deploymentLogs.deploymentId], references: [deployments.id] }),
}))

export const databaseServicesRelations = relations(databaseServices, ({ one }) => ({
  project: one(projects, { fields: [databaseServices.projectId], references: [projects.id] }),
}))

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Service = typeof services.$inferSelect
export type NewService = typeof services.$inferInsert
export type DatabaseService = typeof databaseServices.$inferSelect
export type NewDatabaseService = typeof databaseServices.$inferInsert
export type Deployment = typeof deployments.$inferSelect
export type NewDeployment = typeof deployments.$inferInsert
export type EnvVar = typeof envVars.$inferSelect
export type Domain = typeof domains.$inferSelect
export type Metric = typeof metrics.$inferSelect
export type Volume = typeof volumes.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
export type Template = typeof templates.$inferSelect
export type DeploymentLog = typeof deploymentLogs.$inferSelect

export interface TemplateServiceConfig {
  name: string
  type: 'web' | 'worker' | 'cron'
  buildSystem: 'railpack' | 'dockerfile' | 'static'
  port?: number
  envVars?: Record<string, string>
  databases?: string[]
}
