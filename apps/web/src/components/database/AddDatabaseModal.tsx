'use client'

import { useState } from 'react'
import { databasesApi } from '@/lib/api'
import { X, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

const DB_OPTIONS = [
  { engine: 'postgresql', label: 'PostgreSQL', icon: '🐘', description: 'Open source relational database' },
  { engine: 'mysql', label: 'MySQL', icon: '🐬', description: 'Most popular open source DB' },
  { engine: 'mongodb', label: 'MongoDB', icon: '🍃', description: 'Document-oriented NoSQL' },
  { engine: 'redis', label: 'Redis', icon: '🔴', description: 'In-memory data structure store' },
  { engine: 'mariadb', label: 'MariaDB', icon: '🦭', description: 'MySQL fork, fully compatible' },
]

export function AddDatabaseModal({ projectId, onClose, onCreated }: Props) {
  const [selectedEngine, setSelectedEngine] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  async function provision() {
    if (!selectedEngine || !name.trim()) return
    setLoading(true)
    try {
      const data = await databasesApi.create(projectId, {
        name: name.trim(),
        engine: selectedEngine,
      })
      setResult(data)
      onCreated()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={result ? undefined : onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">{result ? 'Database Created' : 'Add Database'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <p className="text-xs text-warning font-medium mb-1">Save your credentials now</p>
              <p className="text-xs text-muted-foreground">This password will not be shown again.</p>
            </div>

            {[
              { label: 'Connection String', value: result.connectionString },
              { label: 'Password', value: result.password },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <div className="flex items-center gap-2 bg-background border border-border rounded px-3 py-2">
                  <code className="text-xs flex-1 font-mono break-all">{item.value}</code>
                  <button onClick={() => copy(item.value)} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}

            <button onClick={onClose} className="w-full py-2 text-sm bg-accent text-black font-medium rounded">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Engine select */}
            <div className="grid grid-cols-1 gap-2">
              {DB_OPTIONS.map((db) => (
                <button
                  key={db.engine}
                  onClick={() => setSelectedEngine(db.engine)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                    selectedEngine === db.engine ? 'border-accent bg-accent/5' : 'border-border hover:border-white/20'
                  }`}
                >
                  <span className="text-xl">{db.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{db.label}</p>
                    <p className="text-xs text-muted-foreground">{db.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Database Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-database"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded">Cancel</button>
              <button
                onClick={provision}
                disabled={loading || !selectedEngine || !name.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-black font-medium rounded disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Provision
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
