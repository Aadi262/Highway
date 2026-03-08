import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(16),

  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(16),

  PLATFORM_DOMAIN: z.string().min(1),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),

  CADDY_ADMIN: z.string().url().default('http://localhost:2019'),
  ACME_EMAIL: z.string().email().optional(),

  DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  ${field}: ${errors?.join(', ')}`)
  }
  process.exit(1)
}

export const env = parsed.data
