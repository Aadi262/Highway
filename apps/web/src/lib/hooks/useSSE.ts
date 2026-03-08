'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createLogStream } from '../api'
import type { LogEntry } from '@highway/shared'

export function useSSELogs(serviceId: string, deploymentId?: string, maxLines = 1000) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!serviceId) return

    const es = createLogStream(serviceId, deploymentId)
    esRef.current = es

    const seen = new Set<string>()

    es.addEventListener('log', (e) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry
        const key = `${entry.timestamp}|${entry.stream}|${entry.line}`
        if (seen.has(key)) return
        seen.add(key)
        setLogs((prev) => {
          const next = [...prev, entry]
          return next.length > maxLines ? next.slice(-maxLines) : next
        })
      } catch {}
    })

    es.addEventListener('ping', () => {})

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    return () => {
      es.close()
      esRef.current = null
      setConnected(false)
    }
  }, [serviceId, deploymentId, maxLines])

  const clear = useCallback(() => setLogs([]), [])

  return { logs, connected, clear }
}
