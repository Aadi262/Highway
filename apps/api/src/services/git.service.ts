import { Octokit } from '@octokit/rest'
import { createHmac, timingSafeEqual } from 'crypto'
import { env } from '../lib/env'

export const gitService = {
  client(accessToken: string) {
    return new Octokit({ auth: accessToken })
  },

  async listRepos(accessToken: string) {
    const octokit = this.client(accessToken)
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      type: 'owner',
    })
    return data.map((r) => ({
      id: String(r.id),
      name: r.name,
      fullName: r.full_name,
      cloneUrl: r.clone_url,
      defaultBranch: r.default_branch,
      isPrivate: r.private,
      language: r.language,
      updatedAt: r.updated_at,
      description: r.description,
    }))
  },

  async listBranches(accessToken: string, owner: string, repo: string) {
    const octokit = this.client(accessToken)
    const { data } = await octokit.repos.listBranches({ owner, repo, per_page: 50 })
    return data.map((b) => ({ name: b.name, sha: b.commit.sha }))
  },

  async getRepo(accessToken: string, owner: string, repo: string) {
    const octokit = this.client(accessToken)
    const { data } = await octokit.repos.get({ owner, repo })
    return {
      id: String(data.id),
      name: data.name,
      fullName: data.full_name,
      cloneUrl: data.clone_url,
      defaultBranch: data.default_branch,
    }
  },

  async registerWebhook(accessToken: string, owner: string, repo: string): Promise<number> {
    const octokit = this.client(accessToken)
    const webhookUrl = `${env.API_URL}/webhooks/github`

    const { data } = await octokit.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: env.GITHUB_WEBHOOK_SECRET,
      },
      events: ['push'],
      active: true,
    })

    return data.id
  },

  async removeWebhook(accessToken: string, owner: string, repo: string, webhookId: number) {
    try {
      const octokit = this.client(accessToken)
      await octokit.repos.deleteWebhook({ owner, repo, hook_id: webhookId })
    } catch {}
  },

  verifyWebhookSignature(body: string, signature: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')
    if (signature.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  },

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${env.API_URL}/api/auth/github/callback`,
      scope: 'user:email,repo,admin:repo_hook',
      state,
    })
    return `https://github.com/login/oauth/authorize?${params}`
  },

  async exchangeCode(code: string): Promise<string> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })
    const data = await res.json() as any
    if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description}`)
    return data.access_token
  },

  async getAuthenticatedUser(accessToken: string) {
    const octokit = this.client(accessToken)
    const { data } = await octokit.users.getAuthenticated()
    return {
      id: String(data.id),
      username: data.login,
      name: data.name ?? data.login,
      email: data.email ?? undefined,
      avatarUrl: data.avatar_url,
    }
  },
}
