'use client'

import { useEffect, useState } from 'react'
import { projectsApi, metricsApi } from '@/lib/api'
import { cn, statusDot, statusColor } from '@/lib/utils'
import { Loader2, Activity, Server, Box, Database, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ServiceWithMetrics {
  id: string
  name: string
  slug: string
  status: string
  projectId: string
  projectName: string
  containerId: string | null
  cpuPercent?: number
  memoryMb?: number
  memoryLimitMb?: number
}

export default function MonitoringPage() {
  const [services, setServices] = useState<ServiceWithMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const projects = await projectsApi.list() as any[]

      const servicesWithMeta: ServiceWithMetrics[] = []
      for (const project of projects) {
        const detail = await projectsApi.get(project.id)
        for (const svc of (detail.services ?? [])) {
          servicesWithMeta.push({
            ...svc,
            projectName: project.name,
          })
        }
      }

      // Fetch live metrics for running services in parallel
      const withMetrics = await Promise.all(
        servicesWithMeta.map(async (svc) => {
          if (svc.status !== 'running' || !svc.containerId) return svc
          try {
            const stats = await metricsApi.live(svc.id)
            return { ...svc, ...stats }
          } catch {
            return svc
          }
        })
      )

      setServices(withMetrics)
      setLastUpdated(new Date())
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 30_000)
    return () => clearInterval(interval)
  }, [])

  const running = services.filter((s) => s.status === 'running').length
  const stopped = services.filter((s) => s.status === 'stopped').length
  const errored = services.filter((s) => ['error', 'crashed'].includes(s.status)).length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-2 rounded transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Running" value={running} color="text-accent" icon={<Activity className="w-4 h-4" />} />
        <StatCard label="Stopped" value={stopped} color="text-muted-foreground" icon={<Box className="w-4 h-4" />} />
        <StatCard label="Errors" value={errored} color={errored > 0 ? 'text-danger' : 'text-muted-foreground'} icon={<Server className="w-4 h-4" />} />
      </div>

      {/* Services table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium text-foreground">No services yet</p>
          <p className="text-sm mt-1">Create a project and deploy a service to see metrics here</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-normal">Service</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-normal">Project</th>
                <th className="text-left px-5 py-3 text-xs text-muted-foreground font-normal">Status</th>
                <th className="text-right px-5 py-3 text-xs text-muted-foreground font-normal">CPU</th>
                <th className="text-right px-5 py-3 text-xs text-muted-foreground font-normal">Memory</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id} className="border-b border-border last:border-0 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/projects/${svc.projectId}/services/${svc.id}`}
                      className="font-medium hover:text-accent transition-colors"
                    >
                      {svc.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    <Link href={`/projects/${svc.projectId}`} className="hover:text-foreground transition-colors">
                      {svc.projectName}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', statusDot(svc.status))} />
                      <span className={cn('text-xs capitalize', statusColor(svc.status))}>{svc.status}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                    {svc.cpuPercent != null
                      ? `${(svc.cpuPercent / 100).toFixed(1)}%`
                      : '—'
                    }
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                    {svc.memoryMb != null
                      ? `${svc.memoryMb} / ${svc.memoryLimitMb ?? '?'} MB`
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold mt-1', color)}>{value}</p>
      </div>
      <div className={cn('opacity-40', color)}>{icon}</div>
    </div>
  )
}
