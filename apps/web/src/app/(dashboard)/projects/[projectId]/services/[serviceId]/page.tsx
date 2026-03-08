'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { servicesApi, databasesApi, linkDatabaseApi } from '@/lib/api'
import { LogViewer } from '@/components/service/LogViewer'
import { DeployTimeline } from '@/components/service/DeployTimeline'
import { EnvEditor } from '@/components/service/EnvEditor'
import { MetricsChart } from '@/components/service/MetricsChart'
import { DomainManager } from '@/components/service/DomainManager'
import { cn, statusDot, statusColor, timeAgo } from '@/lib/utils'
import { Play, Square, RotateCcw, ExternalLink, ArrowLeft, Loader2, Link2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

type Tab = 'logs' | 'deployments' | 'variables' | 'metrics' | 'domains' | 'settings'

export default function ServicePage() {
  const { projectId, serviceId } = useParams<{ projectId: string; serviceId: string }>()
  const [service, setService] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('logs')
  const [viewingDeployId, setViewingDeployId] = useState<string | undefined>()

  async function load() {
    try {
      const data = await servicesApi.get(serviceId)
      setService(data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [serviceId])

  async function deploy() {
    try { await servicesApi.deploy(serviceId); toast.success('Deployment triggered') } catch (e: any) { toast.error(e.message) }
  }
  async function stop() {
    try { await servicesApi.stop(serviceId); toast.success('Service stopped'); load() } catch (e: any) { toast.error(e.message) }
  }
  async function restart() {
    try { await servicesApi.restart(serviceId); toast.success('Restart triggered') } catch (e: any) { toast.error(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  if (!service) return <div className="p-8 text-muted-foreground">Service not found</div>

  const tabs: { id: Tab; label: string }[] = [
    { id: 'logs', label: 'Logs' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'variables', label: 'Variables' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'domains', label: 'Domains' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground transition-colors">Project</Link>
          <span>/</span>
          <span className="text-foreground">{service.name}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-2.5 h-2.5 rounded-full', statusDot(service.status))} />
            <div>
              <h1 className="font-semibold">{service.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className={statusColor(service.status)}>{service.status}</span>
                {service.autoDomain && (
                  <a href={`https://${service.autoDomain}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground transition-colors">
                    {service.autoDomain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {service.lastDeployedAt && <span>Last deployed {timeAgo(service.lastDeployedAt)}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={stop} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
            <button onClick={restart} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Restart
            </button>
            <button onClick={deploy} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent hover:bg-accent/90 text-black font-medium rounded transition-colors">
              <Play className="w-3.5 h-3.5" /> Deploy
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 -mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== 'logs') setViewingDeployId(undefined) }}
              className={cn(
                'px-4 py-2 text-sm border-b-2 transition-colors',
                tab === t.id
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'logs' && (
          <LogViewer
            serviceId={serviceId}
            deploymentId={viewingDeployId}
            height="calc(100vh - 220px)"
          />
        )}
        {tab === 'deployments' && (
          <DeployTimeline
            serviceId={serviceId}
            onViewLogs={(deployId) => { setViewingDeployId(deployId); setTab('logs') }}
          />
        )}
        {tab === 'variables' && <EnvEditor serviceId={serviceId} />}
        {tab === 'metrics' && <MetricsChart serviceId={serviceId} />}
        {tab === 'domains' && <DomainManager serviceId={serviceId} autoDomain={service.autoDomain} />}
        {tab === 'settings' && <ServiceSettings service={service} onUpdate={load} />}
      </div>
    </div>
  )
}

function ServiceSettings({ service, onUpdate }: { service: any; onUpdate: () => void }) {
  const [autoDeploy, setAutoDeploy] = useState(service.autoDeploy)
  const [saving, setSaving] = useState(false)
  const [databases, setDatabases] = useState<any[]>([])
  const [selectedDb, setSelectedDb] = useState('')
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    databasesApi.list(service.projectId).then(setDatabases).catch(() => {})
  }, [service.projectId])

  async function save() {
    setSaving(true)
    try {
      await servicesApi.update(service.id, { autoDeploy })
      toast.success('Settings saved')
      onUpdate()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function linkDatabase() {
    if (!selectedDb) return
    setLinking(true)
    try {
      const result = await linkDatabaseApi.link(service.id, selectedDb)
      toast.success(`DATABASE_URL injected — ${result.injectedKeys.length} vars set${service.status === 'running' ? ', redeploying...' : ''}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium">Deploy Settings</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Auto Deploy</p>
            <p className="text-xs text-muted-foreground">Deploy automatically on git push</p>
          </div>
          <button
            onClick={() => setAutoDeploy(!autoDeploy)}
            className={cn('relative w-10 h-5 rounded-full transition-colors', autoDeploy ? 'bg-accent' : 'bg-muted')}
          >
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', autoDeploy ? 'left-5' : 'left-0.5')} />
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-medium">Repository</h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="text-foreground">Repo:</span> {service.gitRepoName ?? '—'}</p>
          <p><span className="text-foreground">Branch:</span> {service.gitBranch ?? '—'}</p>
          <p><span className="text-foreground">Build:</span> {service.buildSystem ?? '—'}</p>
          <p><span className="text-foreground">Port:</span> {service.port ?? '—'}</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-medium">Resource Limits</h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="text-foreground">CPU:</span> {service.cpuLimit ?? 50}% ({((service.cpuLimit ?? 50) / 100).toFixed(2)} cores)</p>
          <p><span className="text-foreground">Memory:</span> {service.memoryLimitMb ?? 512} MB</p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-black text-sm font-medium rounded"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save Changes
      </button>

      {/* Link Database */}
      {databases.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-medium">Link Database</h2>
          <p className="text-xs text-muted-foreground">Injects DATABASE_URL and individual DB_* vars into this service</p>
          <div className="flex gap-2">
            <select
              value={selectedDb}
              onChange={e => setSelectedDb(e.target.value)}
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Select a database...</option>
              {databases.map((db: any) => (
                <option key={db.id} value={db.id}>{db.name} ({db.type})</option>
              ))}
            </select>
            <button
              onClick={linkDatabase}
              disabled={linking || !selectedDb}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium rounded disabled:opacity-50"
            >
              {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
