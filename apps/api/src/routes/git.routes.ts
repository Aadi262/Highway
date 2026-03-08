import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { gitService } from '../services/git.service'
import type { User } from '@highway/db'

const app = new Hono()
app.use('*', authMiddleware)

// GET /api/git/repos — List GitHub repos for the authenticated user
app.get('/repos', async (c) => {
  const user = c.get('user') as User
  const repos = await gitService.listRepos(user.githubAccessToken)
  return c.json(repos)
})

// GET /api/git/repos/:owner/:repo/branches
app.get('/repos/:owner/:repo/branches', async (c) => {
  const user = c.get('user') as User
  const { owner, repo } = c.req.param()
  const branches = await gitService.listBranches(user.githubAccessToken, owner, repo)
  return c.json(branches)
})

export default app
