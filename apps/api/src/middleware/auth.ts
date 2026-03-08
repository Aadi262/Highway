import type { Context, Next } from 'hono'
import { verifyToken } from '../lib/jwt'
import { db } from '../lib/db'
import { users } from '@highway/db'
import { eq } from 'drizzle-orm'

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  // Also accept ?token= for SSE streams (EventSource cannot set headers)
  const token = authHeader?.replace('Bearer ', '') ?? c.req.query('token')

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = verifyToken(token)
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
    if (!user) return c.json({ error: 'User not found' }, 401)
    c.set('user', user)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
