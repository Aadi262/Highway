'use client'

import { useState } from 'react'
import { databasesApi } from '@/lib/api'
import { cn, statusDot } from '@/lib/utils'
import { Copy, Check, Play, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const DB_ICONS: Record<string, string> = {
  postgresql: '🐘',
  mysql: '🐬',
  mongodb: '🍃',
  redis: '🔴',
  mariadb: '🦭',
}

interface Props {
  database: any
  onUpdate: () => void
}

export function DatabaseCard({ database, onUpdate }: Props) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(database.connectionString)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function stop() {
    try { await databasesApi.stop(database.id); onUpdate() } catch (e: any) { toast.error(e.message) }
  }

  async function start() {
    try { await databasesApi.start(database.id); onUpdate() } catch (e: any) { toast.error(e.message) }
  }

  async function remove() {
    if (!confirm(`Delete "${database.name}"? This will destroy all data.`)) return
    try { await databasesApi.delete(database.id); onUpdate() } catch (e: any) { toast.error(e.message) }
  }

  const icon = DB_ICONS[database.type] ?? '🗄️'

  return (
    <div className="bg-surface border border-border rounded-lg p-4 group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-medium">{database.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{database.type} · {database.status}</p>
          </div>
        </div>
        <div className={cn('w-2 h-2 rounded-full mt-1', statusDot(database.status))} />
      </div>

      {/* Connection string */}
      {database.connectionString && (
        <div className="flex items-center gap-2 bg-background rounded px-3 py-2 mb-3">
          <code className="text-xs text-muted-foreground flex-1 truncate font-mono">
            {database.connectionString}
          </code>
          <button onClick={copy} className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {database.status === 'running' ? (
          <button onClick={stop} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
            <Square className="w-3 h-3" /> Stop
          </button>
        ) : (
          <button onClick={start} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
            <Play className="w-3 h-3" /> Start
          </button>
        )}
        <button onClick={remove} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-muted-foreground hover:text-danger rounded transition-colors">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  )
}
