import { env } from '../lib/env'

// BullMQ requires a plain ioredis connection options object (not an ioredis instance)
export const queueConnection = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port) || 6379,
  password: new URL(env.REDIS_URL).password || undefined,
  db: 0,
}
