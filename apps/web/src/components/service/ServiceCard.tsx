'use client'

import Link from 'next/link'
import { servicesApi } from '@/lib/api'
import { cn, statusDot, statusColor, timeAgo } from '@/lib/utils'
import { Play, Square, RotateCcw, ExternalLink, Trash2, GitBranch } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  service: any
  projectId: string
  onUpdate: () => void
}

export function ServiceCard({ service, projectId, onUpdate }: Props) {
  async function deploy() {
    try {
      await servicesApi.deploy(service.id)
      toast.success('Deployment triggered')
      onUpdate()
    } catch (err: any) { toast.error(err.message) }
  }

  async function stop() {
    try {
      await servicesApi.stop(service.id)
      toast.success('Service stopped')
      onUpdate()
    } catch (err: any) { toast.error(err.message) }
  }

  async function restart() {
    try {
      await servicesApi.restart(service.id)
      toast.success('Restart triggered')
    } catch (err: any) { toast.error(err.message) }
  }

  async function remove() {
    if (!confirm(`Delete service "${service.name}"?`)) return
    try {
      await servicesApi.delete(service.id)
      toast.success('Service deleted')
      onUpdate()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4 flex items-center justify-between group hover:border-white/15 transition-colors">
      <div className="flex items-center gap-4">
        {/* Status dot */}
        <div className="relative flex-shrink-0">
          <div className={cn('w-2 h-2 rounded-full', statusDot(service.status))} />
        </div>

        <div>
          <Link
            href={`/projects/${projectId}/services/${service.id}`}
            className="text-sm font-medium hover:text-accent transition-colors"
          >
            {service.name}
          </Link>
          <div className="flex items-center gap-3 mt-0.5">
            {service.gitRepoName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {service.gitRepoName}
                {service.gitBranch && <span className="opacity-60">:{service.gitBranch}</span>}
              </span>
            )}
            <span className={cn('text-xs', statusColor(service.status))}>{service.status}</span>
            {service.lastDeployedAt && (
              <span className="text-xs text-muted-foreground">{timeAgo(service.lastDeployedAt)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {service.autoDomain && (
          <a
            href={`https://${service.autoDomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            title="Open URL"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={deploy} className="p-1.5 text-muted-foreground hover:text-accent transition-colors" title="Deploy">
          <Play className="w-3.5 h-3.5" />
        </button>
        <button onClick={restart} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Restart">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button onClick={stop} className="p-1.5 text-muted-foreground hover:text-warning transition-colors" title="Stop">
          <Square className="w-3.5 h-3.5" />
        </button>
        <button onClick={remove} className="p-1.5 text-muted-foreground hover:text-danger transition-colors" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
