'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ServiceNode {
  id: string
  name: string
  type: 'app' | 'database'
  status: string
  slug?: string
}

interface ServiceGraphProps {
  projectId: string
  services: ServiceNode[]
  databases: ServiceNode[]
}

const STATUS_COLOR: Record<string, string> = {
  running:  '#22c55e',
  building: '#eab308',
  error:    '#ef4444',
  crashed:  '#ef4444',
  stopped:  '#6b7280',
  idle:     '#6b7280',
  degraded: '#f97316',
}

const NODE_W = 140
const NODE_H = 60
const PADDING = 40

export function ServiceGraph({ projectId, services, databases }: ServiceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const router = useRouter()
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const storageKey = `highway:graph:${projectId}`

  const allNodes: (ServiceNode & { isDb: boolean })[] = [
    ...services.map(s => ({ ...s, isDb: false })),
    ...databases.map(d => ({ ...d, isDb: true, type: 'database' as const })),
  ]

  // Initialize positions
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try { setPositions(JSON.parse(saved)); return } catch {}
    }

    // Auto-layout: apps left, databases right
    const initial: Record<string, { x: number; y: number }> = {}
    services.forEach((s, i) => {
      initial[s.id] = { x: PADDING, y: PADDING + i * (NODE_H + 20) }
    })
    databases.forEach((d, i) => {
      initial[d.id] = { x: PADDING + NODE_W + 80, y: PADDING + i * (NODE_H + 20) }
    })
    setPositions(initial)
  }, [projectId, storageKey])

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, W, H)

    // Draw connections (app → database) — simple lines for now
    for (const svc of services) {
      const svcPos = positions[svc.id]
      if (!svcPos) continue
      for (const db of databases) {
        const dbPos = positions[db.id]
        if (!dbPos) continue

        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(svcPos.x + NODE_W, svcPos.y + NODE_H / 2)
        ctx.lineTo(dbPos.x, dbPos.y + NODE_H / 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    // Draw nodes
    for (const node of allNodes) {
      const pos = positions[node.id]
      if (!pos) continue

      const color = STATUS_COLOR[node.status] ?? '#6b7280'
      const isDb = node.isDb

      ctx.save()

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.3)'
      ctx.shadowBlur = 8

      // Background
      ctx.fillStyle = '#1a1a2e'
      if (isDb) {
        // Cylinder-ish: rounded rect with extra top arc
        ctx.beginPath()
        ctx.roundRect(pos.x, pos.y, NODE_W, NODE_H, 8)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.roundRect(pos.x, pos.y, NODE_W, NODE_H, 8)
        ctx.fill()
      }

      ctx.shadowBlur = 0

      // Border with status color
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Status dot
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pos.x + 12, pos.y + 12, 4, 0, Math.PI * 2)
      ctx.fill()

      // Icon area
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.roundRect(pos.x + 8, pos.y + NODE_H - 28, 20, 20, 4)
      ctx.fill()

      // Label text
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      const maxW = NODE_W - 24
      let label = node.name
      while (ctx.measureText(label).width > maxW && label.length > 1) {
        label = label.slice(0, -1)
      }
      if (label !== node.name) label += '…'
      ctx.fillText(label, pos.x + 12, pos.y + NODE_H / 2 - 6)

      // Type label
      ctx.fillStyle = '#64748b'
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(isDb ? '⬡ Database' : '□ Service', pos.x + 12, pos.y + NODE_H / 2 + 10)

      ctx.restore()
    }
  }, [positions, allNodes, services, databases])

  function getNodeAt(x: number, y: number): string | null {
    for (const node of allNodes) {
      const pos = positions[node.id]
      if (!pos) continue
      if (x >= pos.x && x <= pos.x + NODE_W && y >= pos.y && y <= pos.y + NODE_H) {
        return node.id
      }
    }
    return null
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const nodeId = getNodeAt(x, y)
    if (nodeId) {
      setDragging(nodeId)
      dragOffset.current = { x: x - positions[nodeId].x, y: y - positions[nodeId].y }
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left - dragOffset.current.x
    const y = e.clientY - rect.top - dragOffset.current.y
    setPositions(prev => {
      const next = { ...prev, [dragging]: { x: Math.max(0, x), y: Math.max(0, y) } }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // If mouse barely moved, treat as click → navigate
    const pos = positions[dragging]
    if (Math.abs(x - pos.x - dragOffset.current.x) < 5 && Math.abs(y - pos.y - dragOffset.current.y) < 5) {
      const node = allNodes.find(n => n.id === dragging)
      if (node && !node.isDb) {
        router.push(`/projects/${projectId}/services/${node.id}`)
      }
    }

    setDragging(null)
  }

  const canvasH = Math.max(200, allNodes.length * (NODE_H + 20) + PADDING * 2)

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Service Topology</p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {Object.entries(STATUS_COLOR).slice(0, 4).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1">
              <span style={{ background: c, display: 'inline-block', width: 6, height: 6, borderRadius: '50%' }} />
              {s}
            </span>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: canvasH, cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setDragging(null)}
      />
    </div>
  )
}
