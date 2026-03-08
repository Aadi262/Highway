const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('highway_token')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  getLoginUrl: () => `${API_BASE}/api/auth/github`,
  me: () => request<{ id: string; username: string; name: string; avatarUrl: string }>('/api/auth/me'),
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: () => request<any[]>('/api/projects'),
  get: (id: string) => request<any>(`/api/projects/${id}`),
  create: (data: { name: string; description?: string }) =>
    request<any>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/api/projects/${id}`, { method: 'DELETE' }),
}

// ─── Services ─────────────────────────────────────────────────────────────────
export const servicesApi = {
  list: (projectId: string) => request<any[]>(`/api/projects/${projectId}/services`),
  get: (id: string) => request<any>(`/api/services/${id}`),
  create: (projectId: string, data: any) =>
    request<any>(`/api/projects/${projectId}/services`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/api/services/${id}`, { method: 'DELETE' }),
  deploy: (id: string) => request<any>(`/api/services/${id}/deploy`, { method: 'POST' }),
  stop: (id: string) => request<any>(`/api/services/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => request<any>(`/api/services/${id}/restart`, { method: 'POST' }),
}

// ─── Deployments ──────────────────────────────────────────────────────────────
export const deploymentsApi = {
  list: (serviceId: string) => request<any[]>(`/api/services/${serviceId}/deployments`),
  get: (id: string) => request<any>(`/api/deployments/${id}`),
  rollback: (id: string) => request<any>(`/api/deployments/${id}/rollback`, { method: 'POST' }),
  cancel: (id: string) => request<any>(`/api/deployments/${id}/cancel`, { method: 'POST' }),
}

// ─── Env vars ─────────────────────────────────────────────────────────────────
export const envApi = {
  list: (serviceId: string) => request<any[]>(`/api/services/${serviceId}/env`),
  set: (serviceId: string, vars: Record<string, string>) =>
    request<any>(`/api/services/${serviceId}/env`, { method: 'POST', body: JSON.stringify({ vars }) }),
  reveal: (serviceId: string, key: string) =>
    request<{ key: string; value: string }>(`/api/services/${serviceId}/env/${key}/reveal`),
  delete: (serviceId: string, key: string) =>
    request<any>(`/api/services/${serviceId}/env/${key}`, { method: 'DELETE' }),
}

// ─── Databases ────────────────────────────────────────────────────────────────
export const databasesApi = {
  listAll: () => request<any[]>('/api/databases'),
  list: (projectId: string) => request<any[]>(`/api/projects/${projectId}/databases`),
  create: (projectId: string, data: any) =>
    request<any>(`/api/projects/${projectId}/databases`, { method: 'POST', body: JSON.stringify(data) }),
  stop: (id: string) => request<any>(`/api/databases/${id}/stop`, { method: 'POST' }),
  start: (id: string) => request<any>(`/api/databases/${id}/start`, { method: 'POST' }),
  delete: (id: string) => request<any>(`/api/databases/${id}`, { method: 'DELETE' }),
}

// ─── Domains ──────────────────────────────────────────────────────────────────
export const domainsApi = {
  list: (serviceId: string) => request<any[]>(`/api/services/${serviceId}/domains`),
  add: (serviceId: string, hostname: string) =>
    request<any>(`/api/services/${serviceId}/domains`, { method: 'POST', body: JSON.stringify({ hostname }) }),
  delete: (id: string) => request<any>(`/api/domains/${id}`, { method: 'DELETE' }),
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
export const metricsApi = {
  get: (serviceId: string, hours = 1) => request<any[]>(`/api/services/${serviceId}/metrics?hours=${hours}`),
  live: (serviceId: string) => request<any>(`/api/services/${serviceId}/metrics/live`),
}

// ─── Git ──────────────────────────────────────────────────────────────────────
export const gitApi = {
  repos: () => request<any[]>('/api/git/repos'),
  branches: (owner: string, repo: string) => request<any[]>(`/api/git/repos/${owner}/${repo}/branches`),
}

// ─── Templates ────────────────────────────────────────────────────────────────
export const templatesApi = {
  list: () => request<any[]>('/api/templates'),
  get: (slug: string) => request<any>(`/api/templates/${slug}`),
  deploy: (slug: string, projectId: string, overrides?: Record<string, string>) =>
    request<any>(`/api/templates/${slug}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ projectId, overrides }),
    }),
}

// ─── Volumes ──────────────────────────────────────────────────────────────────
export const volumesApi = {
  list: (serviceId: string) => request<any[]>(`/api/services/${serviceId}/volumes`),
  create: (serviceId: string, data: { name: string; mountPath: string; sizeGb: number }) =>
    request<any>(`/api/services/${serviceId}/volumes`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<any>(`/api/volumes/${id}`, { method: 'DELETE' }),
}

// ─── Link Database ────────────────────────────────────────────────────────────
export const linkDatabaseApi = {
  link: (serviceId: string, databaseServiceId: string) =>
    request<any>(`/api/services/${serviceId}/link-database`, {
      method: 'POST',
      body: JSON.stringify({ databaseServiceId }),
    }),
}

// ─── SSE Log Stream ───────────────────────────────────────────────────────────
export function createLogStream(serviceId: string, deploymentId?: string): EventSource {
  const token = getToken()
  const params = new URLSearchParams()
  if (deploymentId) params.set('deploymentId', deploymentId)
  if (token) params.set('token', token)
  return new EventSource(
    `${API_BASE}/api/services/${serviceId}/logs/stream?${params}`
  )
}
