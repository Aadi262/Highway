'use client'

import { useState } from 'react'
import { databasesApi } from '@/lib/api'
import { X, Loader2, Copy, Check, Link2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

// SVG icons as inline components — no extra deps needed
function PgIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#336791" />
      <path d="M17.5 8.5c-.4-1.5-1.7-2.5-3.2-2.5H9.7C8.2 6 6.9 7 6.5 8.5L5 15.5c-.3 1.3.7 2.5 2 2.5h1l.5 2h7l.5-2h1c1.3 0 2.3-1.2 2-2.5L17.5 8.5z" fill="white" fillOpacity="0.9" />
    </svg>
  )
}

function MySQLIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4479A1" />
      <text x="5" y="16" fontSize="9" fontWeight="bold" fill="white" fontFamily="monospace">SQL</text>
    </svg>
  )
}

function MongoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#47A248" />
      <path d="M12 5v14M9 17c1 .7 2 1 3 1s2-.3 3-1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function RedisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#DC382D" />
      <text x="5.5" y="16" fontSize="8" fontWeight="bold" fill="white" fontFamily="monospace">RDS</text>
    </svg>
  )
}

function MariaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#C0765A" />
      <text x="5" y="16" fontSize="8" fontWeight="bold" fill="white" fontFamily="monospace">MDB</text>
    </svg>
  )
}

function ClickIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#FACC15" />
      <text x="5" y="16" fontSize="7" fontWeight="bold" fill="#111" fontFamily="monospace">CKH</text>
    </svg>
  )
}

const DB_OPTIONS = [
  {
    engine: 'postgresql',
    label: 'PostgreSQL',
    description: 'Open-source relational database. The most trusted choice.',
    Icon: PgIcon,
    accent: 'border-blue-500/30 bg-blue-500/5',
    accentHover: 'hover:border-blue-500/40',
    iconBg: 'bg-blue-500/10',
  },
  {
    engine: 'mysql',
    label: 'MySQL',
    description: 'Most popular open-source SQL database worldwide.',
    Icon: MySQLIcon,
    accent: 'border-blue-400/30 bg-blue-400/5',
    accentHover: 'hover:border-blue-400/40',
    iconBg: 'bg-blue-400/10',
  },
  {
    engine: 'mongodb',
    label: 'MongoDB',
    description: 'Flexible document-oriented NoSQL store.',
    Icon: MongoIcon,
    accent: 'border-green-500/30 bg-green-500/5',
    accentHover: 'hover:border-green-500/40',
    iconBg: 'bg-green-500/10',
  },
  {
    engine: 'redis',
    label: 'Redis',
    description: 'In-memory data store for caching and queues.',
    Icon: RedisIcon,
    accent: 'border-red-500/30 bg-red-500/5',
    accentHover: 'hover:border-red-500/40',
    iconBg: 'bg-red-500/10',
  },
  {
    engine: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL-compatible fork with extra features.',
    Icon: MariaIcon,
    accent: 'border-amber-600/30 bg-amber-600/5',
    accentHover: 'hover:border-amber-600/40',
    iconBg: 'bg-amber-600/10',
  },
  {
    engine: 'clickhouse',
    label: 'ClickHouse',
    description: 'Columnar OLAP database for analytics at scale.',
    Icon: ClickIcon,
    accent: 'border-yellow-400/30 bg-yellow-400/5',
    accentHover: 'hover:border-yellow-400/40',
    iconBg: 'bg-yellow-400/10',
  },
]

interface CopyButtonProps {
  value: string
}

function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={copy}
      className="flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-accent" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

export function AddDatabaseModal({ projectId, onClose, onCreated }: Props) {
  const [selectedEngine, setSelectedEngine] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const selectedOption = DB_OPTIONS.find((d) => d.engine === selectedEngine)

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

  const credentialFields = result
    ? [
        { label: 'Connection String', key: 'connectionString', value: result.connectionString, mono: true },
        { label: 'Host', key: 'host', value: result.host, mono: true },
        { label: 'Port', key: 'port', value: String(result.port ?? ''), mono: true },
        { label: 'Database', key: 'database', value: result.database ?? result.name, mono: true },
        { label: 'Username', key: 'username', value: result.username, mono: true },
        { label: 'Password', key: 'password', value: result.password, mono: true },
      ].filter((f) => f.value)
    : []

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={result ? undefined : onClose}
    >
      <div
        className="bg-[#111111] border border-[#1e1e1e] rounded-xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-sm font-semibold">
              {result ? 'Database Ready' : 'Add Database'}
            </h2>
            {!result && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Provision a managed database in your project
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-1 hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {result ? (
          /* ── Credentials screen ── */
          <div className="p-6 space-y-5">
            {/* Warning banner */}
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-400">Save your credentials now</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  The password will not be shown again after you close this dialog.
                </p>
              </div>
            </div>

            {/* Credential fields */}
            <div className="space-y-2">
              {credentialFields.map((field) => (
                <div key={field.key}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{field.label}</p>
                  <div className="flex items-center gap-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <code className="text-xs flex-1 font-mono text-foreground/90 break-all select-all">
                      {field.value}
                    </code>
                    <CopyButton value={field.value} />
                  </div>
                </div>
              ))}
            </div>

            {/* Link to Service hint */}
            <div className="flex items-start gap-3 bg-accent/5 border border-accent/15 rounded-lg px-4 py-3">
              <Link2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-accent">Link to a Service</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Open a service's environment settings and inject the connection string as an env var.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-medium bg-accent text-black rounded-lg hover:bg-accent/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Configuration screen ── */
          <div className="p-6 space-y-6">
            {/* Database type grid */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Database Engine
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DB_OPTIONS.map((db) => {
                  const isSelected = selectedEngine === db.engine
                  return (
                    <button
                      key={db.engine}
                      onClick={() => setSelectedEngine(db.engine)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all',
                        isSelected
                          ? db.accent
                          : 'border-[#1e1e1e] bg-[#0a0a0a] hover:bg-white/[0.02] hover:border-white/10',
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          isSelected ? db.iconBg : 'bg-white/5',
                        )}
                      >
                        <db.Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{db.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                          {db.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Name + Version row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedOption ? `my-${selectedOption.label.toLowerCase()}` : 'my-database'}
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Version
                </label>
                <select
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 appearance-none text-muted-foreground"
                  disabled
                >
                  <option>Latest</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={provision}
                disabled={loading || !selectedEngine || !name.trim()}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all',
                  'bg-accent text-black hover:bg-accent/90',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {loading ? 'Provisioning…' : 'Provision Database'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
