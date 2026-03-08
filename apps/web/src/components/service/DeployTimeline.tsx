'use client'

import { useEffect, useState } from 'react'
import { deploymentsApi } from '@/lib/api'
import { cn, timeAgo, formatDuration, statusColor } from '@/lib/utils'
import { RotateCcw, GitCommit, Loader2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  serviceId: string
  onViewLogs?: (deploymentId: string) => void
}

export function DeployTimeline({ serviceId, onViewLogs }: Props) {
  const [deployments, setDeployments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await deploymentsApi.list(serviceId)
      setDeployments(data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [serviceId])

  async function rollback(deploymentId: string) {
    if (!confirm('Roll back to this deployment?')) return
    try {
      await deploymentsApi.rollback(deploymentId)
      toast.success('Rollback triggered')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  if (deployments.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No deployments yet</div>
  }

  return (
    <div className="space-y-2">
      {deployments.map((d, i) => (
        <div
          key={d.id}
          className="flex items-center gap-4 bg-surface border border-border rounded-lg px-4 py-3 group hover:border-white/15 transition-colors"
        >
          {/* Status icon */}
          <StatusIcon status={d.status} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium capitalize', statusColor(d.status))}>{d.status}</span>
              {d.isRollback && <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded">Rollback</span>}
              {d.trigger === 'push' && <span className="text-xs text-muted-foreground">via push</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {d.commitHash && (
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <GitCommit className="w-3 h-3" />
                  {d.commitHash.slice(0, 7)}
                </span>
              )}
              {d.commitMessage && (
                <span className="text-xs text-muted-foreground truncate max-w-xs">{d.commitMessage}</span>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
            {d.buildDuration && <span>{formatDuration(d.buildDuration)} build</span>}
            <span>{timeAgo(d.createdAt)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onViewLogs && (
              <button
                onClick={() => onViewLogs(d.id)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border border-border rounded transition-colors flex items-center gap-1"
              >
                Logs
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {d.status === 'success' && i > 0 && (
              <button
                onClick={() => rollback(d.id)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Rollback to this deployment"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs'
  switch (status) {
    case 'success': return <div className={cn(base, 'bg-accent/15 text-accent')}>✓</div>
    case 'failed': return <div className={cn(base, 'bg-danger/15 text-danger')}>✗</div>
    case 'building': return <div className={cn(base, 'bg-warning/15 text-warning')}><Loader2 className="w-3 h-3 animate-spin" /></div>
    case 'deploying': return <div className={cn(base, 'bg-warning/15 text-warning')}><Loader2 className="w-3 h-3 animate-spin" /></div>
    case 'cancelled': return <div className={cn(base, 'bg-muted/15 text-muted-foreground')}>○</div>
    default: return <div className={cn(base, 'bg-muted/15 text-muted-foreground')}>⋯</div>
  }
}
