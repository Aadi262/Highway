import { Hono } from 'hono'
import { gitService } from '../services/git.service'
import { buildQueue } from '../queue/queues'
import { db } from '../lib/db'
import { services } from '@highway/db'
import { eq } from 'drizzle-orm'

const app = new Hono()

// POST /webhooks/github — GitHub push webhook
app.post('/webhooks/github', async (c) => {
  const body = await c.req.text()
  const signature = c.req.header('x-hub-signature-256') ?? ''
  const event = c.req.header('x-github-event')

  // Verify HMAC signature
  if (!gitService.verifyWebhookSignature(body, signature)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Only handle push events
  if (event !== 'push') {
    return c.json({ ok: true, skipped: true })
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const repoId = String(payload.repository?.id)
  const branch = (payload.ref as string)?.replace('refs/heads/', '')
  const commit = payload.head_commit

  // Skip if no commit (e.g. branch deletion)
  if (!commit) return c.json({ ok: true, skipped: true })

  // Find services with auto-deploy connected to this repo + branch
  const matchingServices = await db.select().from(services)
    .where(eq(services.gitRepoId, repoId))

  let triggered = 0
  for (const service of matchingServices) {
    if (service.gitBranch !== branch) continue
    if (!service.autoDeploy || !service.isActive) continue

    await buildQueue.add('build', {
      serviceId: service.id,
      trigger: 'push',
      commitHash: commit.id,
      commitMessage: commit.message?.slice(0, 200),
      commitAuthor: commit.author?.name,
      branch,
    })
    triggered++
  }

  return c.json({ ok: true, triggered })
})

export default app
