'use client'

import { useEffect, useState, useRef } from 'react'
import { domainsApi } from '@/lib/api'
import { Plus, Trash2, ExternalLink, Loader2, Globe, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const SSL_BADGE: Record<string, { label: string; dot: string }> = {
  pending:      { label: 'Pending',      dot: 'bg-yellow-400' },
  provisioning: { label: 'Provisioning', dot: 'bg-blue-400' },
  active:       { label: 'Active',       dot: 'bg-green-400' },
  expired:      { label: 'Expired',      dot: 'bg-red-400' },
  failed:       { label: 'Failed',       dot: 'bg-red-400' },
}

interface DomainManagerProps {
  serviceId: string
  autoDomain?: string | null
}

export function DomainManager({ serviceId, autoDomain }: DomainManagerProps) {
  const [domains, setDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hostname, setHostname] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const list = await domainsApi.list(serviceId)
      setDomains(list)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Poll every 5s for SSL status changes
    pollingRef.current = setInterval(load, 5000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [serviceId])

  async function addDomain() {
    if (!hostname.trim()) return
    setAdding(true)
    try {
      await domainsApi.add(serviceId, hostname.trim())
      toast.success(`Domain ${hostname} added`)
      setHostname('')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function deleteDomain(id: string) {
    if (!confirm('Remove this domain?')) return
    try {
      await domainsApi.delete(id)
      toast.success('Domain removed')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? autoDomain?.split('.').slice(1).join('.')

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Auto-generated domain */}
      {autoDomain && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Auto-Generated Domain</p>
          <div className="flex items-center justify-between">
            <a
              href={`https://${autoDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <Globe className="w-4 h-4" />
              {autoDomain}
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Add domain form */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium">Add Custom Domain</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={hostname}
            onChange={e => setHostname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDomain()}
            placeholder="api.myapp.com"
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-foreground"
          />
          <button
            onClick={addDomain}
            disabled={adding || !hostname.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium rounded disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>

        {hostname && platformDomain && (
          <div className="bg-background border border-border rounded p-3 text-xs space-y-2">
            <p className="text-muted-foreground font-medium">DNS Configuration</p>
            <p className="text-muted-foreground">Add a CNAME record at your DNS provider:</p>
            <div className="flex items-center gap-2 font-mono bg-surface px-3 py-2 rounded">
              <span className="text-accent">{hostname}</span>
              <span className="text-muted-foreground mx-1">CNAME</span>
              <span className="text-foreground">{platformDomain}</span>
              <button
                onClick={() => copyToClipboard(platformDomain ?? '')}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Domain list */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Custom Domains ({domains.length})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : domains.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
            No custom domains — add one above
          </div>
        ) : (
          <div className="space-y-2">
            {domains.map((domain: any) => {
              const badge = SSL_BADGE[domain.sslStatus] ?? SSL_BADGE.pending
              return (
                <div key={domain.id} className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <a
                        href={`https://${domain.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:underline flex items-center gap-1"
                      >
                        {domain.hostname}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                      {domain.verifiedAt && (
                        <p className="text-xs text-muted-foreground">
                          Verified {new Date(domain.verifiedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className={cn('w-1.5 h-1.5 rounded-full', badge.dot)} />
                      <span className="text-xs text-muted-foreground">{badge.label}</span>
                    </div>
                    <button
                      onClick={() => deleteDomain(domain.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
