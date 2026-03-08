import type { Context, Next } from 'hono'
import { redis } from '../lib/redis'
import { REDIS_KEYS } from '@highway/shared'

interface RateLimitOptions {
  windowSec: number
  max: number
}

export function rateLimit({ windowSec, max }: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
    const route = c.req.path
    const key = REDIS_KEYS.rateLimit(ip, route)

    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, windowSec)
    }

    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - current)))

    if (current > max) {
      return c.json({ error: 'Too many requests' }, 429)
    }

    await next()
  }
}
