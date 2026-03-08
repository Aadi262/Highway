import { env } from '../lib/env'
import { CADDY } from '@highway/shared'
import type { Service } from '@highway/db'

interface CaddyRoute {
  '@id': string
  match: Array<{ host: string[] }>
  handle: Array<{
    handler: string
    upstreams?: Array<{ dial: string }>
    routes?: any[]
  }>
  terminal: boolean
}

export const proxyService = {
  getRouteId(serviceId: string, suffix = '') {
    return `${CADDY.ROUTE_ID_PREFIX}${serviceId}${suffix}`
  },

  buildRoute(id: string, hostname: string, upstreamDial: string): CaddyRoute {
    return {
      '@id': id,
      match: [{ host: [hostname] }],
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: upstreamDial }],
        },
      ],
      terminal: true,
    }
  },

  async ensureHttpServer() {
    // Check if the highway HTTP server already exists in Caddy config
    const res = await fetch(`${env.CADDY_ADMIN}/config/apps/http/servers/highway`)
    if (res.ok) return

    // Server doesn't exist — initialize Caddy with an empty HTTP server on port 80
    const initRes = await fetch(`${env.CADDY_ADMIN}/config/apps/http/servers/highway`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listen: [':80'], routes: [] }),
    })

    if (!initRes.ok) {
      // May fail if /config/apps/http doesn't exist either — try creating the full apps/http object
      const fullRes = await fetch(`${env.CADDY_ADMIN}/config/apps/http`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: { highway: { listen: [':80'], routes: [] } } }),
      })
      if (!fullRes.ok) {
        const text = await fullRes.text()
        throw new Error(`Failed to initialize Caddy HTTP server: ${text}`)
      }
    }
  },

  async upsertRoute(routeId: string, hostname: string, upstreamDial: string) {
    const route = this.buildRoute(routeId, hostname, upstreamDial)

    // Try to update existing route first (works if route already exists)
    const updateRes = await fetch(`${env.CADDY_ADMIN}/id/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route),
    })
    if (updateRes.ok) return

    // Route doesn't exist — ensure server is initialized, then add route
    await this.ensureHttpServer()

    const addRes = await fetch(`${env.CADDY_ADMIN}/config/apps/http/servers/highway/routes/...`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route),
    })

    if (!addRes.ok) {
      const errText = await addRes.text()
      throw new Error(`Caddy route update failed: ${errText}`)
    }
  },

  async removeRoute(routeId: string) {
    try {
      await fetch(`${env.CADDY_ADMIN}/id/${routeId}`, { method: 'DELETE' })
    } catch {}
  },

  async updateServiceRoute(service: Service, containerIp: string) {
    const port = service.port ?? 3000
    const hostname = service.autoDomain ?? `${service.slug}.${env.PLATFORM_DOMAIN}`
    const routeId = this.getRouteId(service.id)
    await this.upsertRoute(routeId, hostname, `${containerIp}:${port}`)
    return hostname
  },

  async addCustomDomain(service: Service, hostname: string, containerIp: string) {
    const port = service.port ?? 3000
    const suffix = `-domain-${hostname.replace(/\./g, '-')}`
    const routeId = this.getRouteId(service.id, suffix)
    await this.upsertRoute(routeId, hostname, `${containerIp}:${port}`)
    return routeId
  },

  async removeServiceRoutes(serviceId: string) {
    // Remove primary route
    await this.removeRoute(this.getRouteId(serviceId))
  },

  // Get the auto-generated domain for a service
  getAutoDomain(serviceSlug: string): string {
    return `${serviceSlug}.${env.PLATFORM_DOMAIN}`
  },
}
