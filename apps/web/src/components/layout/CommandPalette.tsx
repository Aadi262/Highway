'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { projectsApi, servicesApi } from '@/lib/api'
import { Search, Folder, Box, Database, Activity, LayoutGrid, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  label: string
  sublabel?: string
  href: string
  icon: React.ReactNode
  type: 'project' | 'service' | 'page'
}

const STATIC_PAGES: Item[] = [
  { id: 'projects', label: 'Projects', href: '/projects', icon: <LayoutGrid className="w-4 h-4" />, type: 'page' },
  { id: 'databases', label: 'Databases', href: '/databases', icon: <Database className="w-4 h-4" />, type: 'page' },
  { id: 'monitoring', label: 'Monitoring', href: '/monitoring', icon: <Activity className="w-4 h-4" />, type: 'page' },
  { id: 'templates', label: 'Templates', href: '/templates', icon: <Layers className="w-4 h-4" />, type: 'page' },
]

function score(item: Item, query: string): number {
  const q = query.toLowerCase()
  const label = item.label.toLowerCase()
  if (label === q) return 3
  if (label.startsWith(q)) return 2
  if (label.includes(q)) return 1
  return 0
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [filtered, setFiltered] = useState<Item[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recentKey = 'highway:cmd:recent'

  function getRecent(): Item[] {
    try {
      return JSON.parse(localStorage.getItem(recentKey) ?? '[]')
    } catch {
      return []
    }
  }

  function saveRecent(item: Item) {
    const recent = [item, ...getRecent().filter(r => r.id !== item.id)].slice(0, 5)
    localStorage.setItem(recentKey, JSON.stringify(recent))
  }

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const projectList = await projectsApi.list()
      const projectItems: Item[] = projectList.map((p: any) => ({
        id: `project-${p.id}`,
        label: p.name,
        sublabel: 'Project',
        href: `/projects/${p.id}`,
        icon: <Folder className="w-4 h-4" />,
        type: 'project' as const,
      }))

      setItems([...STATIC_PAGES, ...projectItems])
    } catch {
      setItems(STATIC_PAGES)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadItems()
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelected(0)
    }
  }, [open, loadItems])

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(getRecent().length > 0 ? getRecent() : STATIC_PAGES)
      return
    }
    const scored = items
      .map(item => ({ item, s: score(item, query) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.item)
    setFiltered(scored)
    setSelected(0)
  }, [query, items])

  function navigate(item: Item) {
    saveRecent(item)
    router.push(item.href)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && filtered[selected]) navigate(filtered[selected])
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, filtered, selected])

  if (!open) return null

  const grouped: Record<string, Item[]> = {}
  for (const item of filtered) {
    grouped[item.type] = [...(grouped[item.type] ?? []), item]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects, pages..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
          ) : (
            <>
              {!query && getRecent().length > 0 && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1.5">Recent</p>
              )}
              {query && Object.keys(grouped).length > 0 && (
                <>
                  {Object.entries(grouped).map(([type, groupItems]) => (
                    <div key={type}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1.5 capitalize">{type}s</p>
                      {groupItems.map(item => {
                        const globalIdx = filtered.indexOf(item)
                        return (
                          <button
                            key={item.id}
                            onClick={() => navigate(item)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-left transition-colors',
                              globalIdx === selected ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                            )}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </>
              )}
              {!query && filtered.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-left transition-colors',
                    idx === selected ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="bg-muted px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-muted px-1 rounded">↵</kbd> select</span>
          <span><kbd className="bg-muted px-1 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
