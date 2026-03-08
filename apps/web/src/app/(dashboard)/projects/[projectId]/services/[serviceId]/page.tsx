'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { servicesApi, databasesApi, linkDatabaseApi, deploymentsApi } from '@/lib/api'
import { LogViewer } from '@/components/service/LogViewer'
import { DeployTimeline } from '@/components/service/DeployTimeline'
import { EnvEditor } from '@/components/service/EnvEditor'
import { MetricsChart } from '@/components/service/MetricsChart'
import { DomainManager } from '@/components/service/DomainManager'
import { cn, statusDot, statusColor, timeAgo } from '@/lib/utils'
import { Play, Square, RotateCcw, ExternalLink, Loader2, Link2, Database, ChevronDown, ChevronUp, GitCommit } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

type Tab = 'logs' | 'deployments' | 'variables' | 'metrics' | 'domains' | 'settings'

const ACTIVE_STATUSES = new Set(['building', 'deploying', 'queued'])

export default function ServicePageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <ServicePage />
    </Suspense>
  )
}

function ServicePage() {
  const { projectId, serviceId } = useParams<{ projectId: string; serviceId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [service, setService] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) ?? 'logs')
  const [activeDeployId, setActiveDeployId] = useState<string | undefined>(
    searchParams.get('deploymentId') ?? undefined
  )
  const [deploying, setDeploying] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await servicesApi.get(serviceId)
      setService(data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [serviceId])

  useEffect(() => { load() }, [load])

  // Poll service status while actively building/deploying
  useEffect(() => {
    if (!service) return
    if (!ACTIVE_STATUSES.has(service.status)) return
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [service?.status, load])

  async function deploy() {
    setDeploying(true)
    try {
      const res = await servicesApi.deploy(serviceId)
      if (res.deploymentId) {
        setActiveDeployId(res.deploymentId)
      }
      setTab('logs')
      toast.success('Deployment started — streaming logs')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeploying(false)
    }
  }

  async function stop() {
    try { await servicesApi.stop(serviceId); toast.success('Stopped'); load() } catch (e: any) { toast.error(e.message) }
  }

  async function restart() {
    try { await servicesApi.restart(serviceId); toast.success('Restarting...'); setTab('logs'); load() } catch (e: any) { toast.error(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
  if (!service) return <div className="p-8 text-muted-foreground">Service not found</div>

  const isActive = ACTIVE_STATUSES.has(service.status)

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'logs', label: 'Logs', badge: isActive ? 'live' : undefined },
    { id: 'deployments', label: 'Deployments' },
    { id: 'variables', label: 'Variables' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'domains', label: 'Domains' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground transition-colors">Project</Link>
          <span>/</span>
          <span className="text-foreground">{service.name}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', statusDot(service.status),
              isActive && 'animate-pulse'
            )} />
            <div>
              <h1 className="font-semibold">{service.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className={statusColor(service.status)}>{service.status}</span>
                {service.gitRepoName && <span className="font-mono">{service.gitRepoName}@{service.gitBranch}</span>}
                {(service.internalUrl || service.autoDomain) && (
                  <a
                    href={service.internalUrl ?? `http://${service.autoDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {service.internalUrl ?? service.autoDomain}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {service.lastDeployedAt && <span>Deployed {timeAgo(service.lastDeployedAt)}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={stop}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
              <Square className="w-3 h-3" /> Stop
            </button>
            <button onClick={restart}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors">
              <RotateCcw className="w-3 h-3" /> Restart
            </button>
            <button onClick={deploy} disabled={deploying || isActive}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-medium rounded transition-colors">
              {(deploying || isActive) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {isActive ? service.status : 'Deploy'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 -mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors',
                tab === t.id ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              {t.badge && (
                <span className="flex items-center gap-1 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'logs' && (
          <div className="space-y-3">
            {activeDeployId && (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-surface border border-border rounded px-3 py-2">
                <span>Streaming build logs for deployment <code className="font-mono text-accent">{activeDeployId.slice(0, 8)}</code></span>
                <button onClick={() => setActiveDeployId(undefined)} className="hover:text-foreground transition-colors">
                  Switch to runtime logs
                </button>
              </div>
            )}
            <LogViewer
              serviceId={serviceId}
              deploymentId={activeDeployId}
              height="calc(100vh - 280px)"
            />
          </div>
        )}

        {tab === 'deployments' && (
          <DeployTimeline
            serviceId={serviceId}
            onViewLogs={(deployId) => { setActiveDeployId(deployId); setTab('logs') }}
          />
        )}

        {tab === 'variables' && (
          <EnvEditorWithDbLink serviceId={serviceId} projectId={service.projectId} />
        )}

        {tab === 'metrics' && <MetricsChart serviceId={serviceId} />}
        {tab === 'domains' && <DomainManager serviceId={serviceId} autoDomain={service.autoDomain} />}
        {tab === 'settings' && <ServiceSettings service={service} onUpdate={load} />}
      </div>
    </div>
  )
}

// Variables tab with DB link prompt
function EnvEditorWithDbLink({ serviceId, projectId }: { serviceId: string; projectId: string }) {
  const [databases, setDatabases] = useState<any[]>([])
  const [selectedDb, setSelectedDb] = useState('')
  const [linking, setLinking] = useState(false)
  const [linked, setLinked] = useState(false)

  useEffect(() => {
    databasesApi.list(projectId).then(setDatabases).catch(() => {})
  }, [projectId])

  async function linkDatabase() {
    if (!selectedDb) return
    setLinking(true)
    try {
      const result = await linkDatabaseApi.link(serviceId, selectedDb)
      toast.success(`Injected ${result.injectedKeys?.length ?? 0} env vars (DATABASE_URL + helpers)`)
      setLinked(true)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Database link banner */}
      {databases.length > 0 && !linked && (
        <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3">
          <Database className="w-4 h-4 text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Link a database</p>
            <p className="text-xs text-muted-foreground">Injects DATABASE_URL + individual connection vars</p>
          </div>
          <select
            value={selectedDb}
            onChange={(e) => setSelectedDb(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="">Select database...</option>
            {databases.map((db: any) => (
              <option key={db.id} value={db.id}>{db.name} ({db.type})</option>
            ))}
          </select>
          <button
            onClick={linkDatabase}
            disabled={linking || !selectedDb}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black text-xs font-medium rounded disabled:opacity-50"
          >
            {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
            Link
          </button>
        </div>
      )}
      <EnvEditor serviceId={serviceId} />
    </div>
  )
}

function ServiceSettings({ service, onUpdate }: { service: any; onUpdate: () => void }) {
  const router = useRouter()
  const [autoDeploy, setAutoDeploy] = useState(service.autoDeploy)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium">Deployment Settings</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Auto Deploy on Push</p>
            <p className="text-xs text-muted-foreground">Deploy automatically when you push to {service.gitBranch}</p>
          </div>
          <button
            onClick={() => setAutoDeploy(!autoDeploy)}
            className={cn('relative w-10 h-5 rounded-full transition-colors', autoDeploy ? 'bg-accent' : 'bg-muted')}
          >
            <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow', autoDeploy ? 'left-5' : 'left-0.5')} />
          </button>
        </div>

        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-1">Repository</p>
          <p className="text-sm font-mono">{service.gitRepoName ?? '—'} @ {service.gitBranch}</p>
        </div>

        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-1">Port</p>
          <p className="text-sm font-mono">{service.port}</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium rounded disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save Changes
        </button>
      </div>

      {/* Danger zone */}
      <div className="bg-surface border border-red-500/20 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-medium text-red-400">Danger Zone</h2>
        <p className="text-xs text-muted-foreground">Permanently delete this service, its container, and all deployment history.</p>
        <button
          onClick={async () => {
            if (!confirm(`Delete service "${service.name}"? This cannot be undone.`)) return
            setDeleting(true)
            try {
              await servicesApi.delete(service.id)
              toast.success('Service deleted')
              router.push(`/projects/${service.projectId}`)
            } catch (e: any) {
              toast.error(e.message)
              setDeleting(false)
            }
          }}
          disabled={deleting}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
        >
          {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Delete Service
        </button>
      </div>
    </div>
  )
}
