'use client'

import { useEffect, useRef, useState } from 'react'
import { useSSELogs } from '@/lib/hooks/useSSE'
import { cn } from '@/lib/utils'
import { Download, Trash2, Wifi, WifiOff } from 'lucide-react'
import type { LogEntry } from '@highway/shared'

interface Props {
  serviceId: string
  deploymentId?: string
  height?: string
}

const STREAM_COLORS: Record<string, string> = {
  stdout: '#FAFAFA',
  stderr: '#EF4444',
  system: '#22C55E',
}

export function LogViewer({ serviceId, deploymentId, height = '500px' }: Props) {
  const { logs, connected, clear } = useSSELogs(serviceId, deploymentId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<'all' | 'stdout' | 'stderr' | 'system'>('all')

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  function downloadLogs() {
    const text = logs.map((l) => `[${l.timestamp}] ${l.line}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `highway-logs-${serviceId.slice(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.stream === filter)

  return (
    <div className="flex flex-col bg-[#0A0A0A] rounded-lg border border-border overflow-hidden font-mono">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-1.5 text-xs', connected ? 'text-accent' : 'text-muted-foreground')}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'Live' : 'Disconnected'}
          </div>
          <span className="text-xs text-muted-foreground">{logs.length} lines</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex items-center gap-1 text-xs">
            {(['all', 'stdout', 'stderr', 'system'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 py-1 rounded transition-colors capitalize',
                  filter === f ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <button onClick={downloadLogs} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Download">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={clear} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ height, overflowY: 'auto' }}
        className="p-4 text-xs leading-relaxed space-y-0.5"
      >
        {filtered.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            {connected ? 'Waiting for logs...' : 'No logs captured'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <LogLine key={i} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}

function LogLine({ entry }: { entry: LogEntry }) {
  const ts = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })
  const color = STREAM_COLORS[entry.stream] ?? '#FAFAFA'

  // Preserve ANSI escape codes for coloring (render as-is in the terminal)
  // Strip ANSI for safety in this simple renderer
  const clean = entry.line.replace(/\x1b\[[0-9;]*m/g, '')

  return (
    <div className="flex gap-3 group hover:bg-white/3 rounded px-1 py-0.5 -mx-1">
      <span className="text-muted-foreground/50 flex-shrink-0 select-none tabular-nums">{ts}</span>
      <span style={{ color }}>{clean}</span>
    </div>
  )
}
