import { Hono } from 'hono'
import { randomBytes } from 'crypto'
import { gitService } from '../services/git.service'
import { signToken } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'
import { rateLimit } from '../middleware/ratelimit'
import { db } from '../lib/db'
import { users } from '@highway/db'
import { eq } from 'drizzle-orm'
import { env } from '../lib/env'

const app = new Hono()

// Store OAuth states temporarily in memory (for production use Redis)
const oauthStates = new Map<string, number>()

// GET /api/auth/github — Initiate GitHub OAuth
app.get('/github', rateLimit({ windowSec: 60, max: 10 }), (c) => {
  const state = randomBytes(16).toString('hex')
  oauthStates.set(state, Date.now() + 10 * 60 * 1000) // 10 min TTL
  const url = gitService.getOAuthUrl(state)
  return c.redirect(url)
})

// GET /api/auth/github/callback — GitHub redirects here
app.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')

  if (!code || !state) {
    return c.redirect(`${env.WEB_URL}/login?error=missing_params`)
  }

  const stateExpiry = oauthStates.get(state)
  if (!stateExpiry || Date.now() > stateExpiry) {
    return c.redirect(`${env.WEB_URL}/login?error=invalid_state`)
  }
  oauthStates.delete(state)

  try {
    // Exchange code for access token
    const accessToken = await gitService.exchangeCode(code)
    const ghUser = await gitService.getAuthenticatedUser(accessToken)

    // Upsert user in DB
    const [existing] = await db.select().from(users).where(eq(users.githubId, ghUser.id)).limit(1)

    let user
    if (existing) {
      const [updated] = await db.update(users).set({
        username: ghUser.username,
        name: ghUser.name,
        email: ghUser.email,
        avatarUrl: ghUser.avatarUrl,
        githubAccessToken: accessToken,
        updatedAt: new Date(),
      }).where(eq(users.id, existing.id)).returning()
      user = updated
    } else {
      const [created] = await db.insert(users).values({
        githubId: ghUser.id,
        username: ghUser.username,
        name: ghUser.name,
        email: ghUser.email,
        avatarUrl: ghUser.avatarUrl,
        githubAccessToken: accessToken,
      }).returning()
      user = created
    }

    const token = signToken({ userId: user.id, username: user.username, githubId: user.githubId })
    return c.redirect(`${env.WEB_URL}/auth/callback?token=${token}`)
  } catch (err) {
    console.error('OAuth error:', err)
    return c.redirect(`${env.WEB_URL}/login?error=auth_failed`)
  }
})

// GET /api/auth/me — Get current user
app.get('/me', authMiddleware, (c) => {
  const user = c.get('user')
  return c.json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  })
})

// POST /api/auth/logout (client just discards the token — but we can invalidate in Redis if needed)
app.post('/logout', authMiddleware, (c) => {
  return c.json({ ok: true })
})

export default app
