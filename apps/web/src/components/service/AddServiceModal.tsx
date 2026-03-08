'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gitApi, servicesApi } from '@/lib/api'
import {
  X,
  Loader2,
  Search,
  GitBranch,
  Lock,
  Globe,
  Monitor,
  Clock,
  ChevronRight,
  Rocket,
  FolderOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

// Language → badge color mapping
const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  JavaScript: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  Python: 'bg-green-500/15 text-green-400 border-green-500/20',
  Go: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  Rust: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  Ruby: 'bg-red-500/15 text-red-400 border-red-500/20',
  Java: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  PHP: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'C#': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  'C++': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  Elixir: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
}

const DEFAULT_LANG_COLOR = 'bg-white/5 text-muted-foreground border-border'

const SERVICE_TYPES = [
  {
    value: 'web',
    label: 'Web Service',
    description: 'Publicly accessible HTTP server',
    icon: Globe,
  },
  {
    value: 'worker',
    label: 'Background Worker',
    description: 'Long-running process, no HTTP',
    icon: Monitor,
  },
  {
    value: 'cron',
    label: 'Cron Job',
    description: 'Scheduled task on a time interval',
    icon: Clock,
  },
]

export function AddServiceModal({ projectId, onClose, onCreated }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<'repo' | 'config'>('repo')
  const [repos, setRepos] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<any>(null)
  const [branches, setBranches] = useState<any[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  const [form, setForm] = useState({
    name: '',
    branch: 'main',
    buildSystem: 'railpack',
    port: 3000,
    rootDirectory: '/',
    autoDeploy: true,
    healthCheckPath: '/health',
    type: 'web',
  })

  useEffect(() => {
    gitApi
      .repos()
      .then((r) => { setRepos(r); setFiltered(r) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      repos.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      ),
    )
  }, [search, repos])

  async function selectRepo(repo: any) {
    setSelectedRepo(repo)
    setForm((f) => ({ ...f, name: repo.name, branch: repo.defaultBranch ?? 'main' }))
    setStep('config')
    const [owner, name] = repo.fullName.split('/')
    setLoadingBranches(true)
    const brs = await gitApi.branches(owner, name).catch(() => [])
    setBranches(brs)
    setLoadingBranches(false)
  }

  async function deploy() {
    if (!selectedRepo || !form.name) return
    setDeploying(true)
    try {
      const service = await servicesApi.create(projectId, {
        name: form.name,
        type: form.type,
        gitRepoId: selectedRepo.id,
        gitRepoUrl: selectedRepo.cloneUrl,
        gitRepoName: selectedRepo.fullName,
        gitBranch: form.branch,
        buildSystem: form.buildSystem,
        port: form.port,
        rootDirectory: form.rootDirectory,
        autoDeploy: form.autoDeploy,
        healthCheckPath: form.healthCheckPath || undefined,
      })
      // Immediately trigger deploy and get deploymentId for live log redirect
      const deployRes = await servicesApi.deploy(service.id).catch(() => null)
      toast.success(`Deploying "${form.name}" — opening live logs`)
      onCreated()
      onClose()
      // Navigate to service page with live logs open
      const deploymentParam = deployRes?.deploymentId ? `&deploymentId=${deployRes.deploymentId}` : ''
      router.push(`/projects/${projectId}/services/${service.id}?tab=logs${deploymentParam}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeploying(false)
    }
  }

  const langColor = selectedRepo?.language
    ? (LANG_COLORS[selectedRepo.language] ?? DEFAULT_LANG_COLOR)
    : DEFAULT_LANG_COLOR

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111111] border border-[#1e1e1e] rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e] flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'config' && (
              <button
                onClick={() => setStep('repo')}
                className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', step === 'repo' ? 'bg-accent/10 text-accent border-accent/20' : 'bg-white/5 text-muted-foreground border-border')}>
                1
              </span>
              <span className={cn('text-xs', step === 'repo' ? 'text-foreground' : 'text-muted-foreground')}>Repository</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', step === 'config' ? 'bg-accent/10 text-accent border-accent/20' : 'bg-white/5 text-muted-foreground border-border')}>
                2
              </span>
              <span className={cn('text-xs', step === 'config' ? 'text-foreground' : 'text-muted-foreground')}>Configure</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors rounded p-1 hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {step === 'repo' ? (
            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold mb-1">Select a Repository</h2>
                <p className="text-xs text-muted-foreground">Choose the GitHub repository to deploy from.</p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories…"
                  className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg pl-10 pr-10 py-2.5 text-sm outline-none focus:border-accent/50 transition-colors placeholder:text-muted-foreground"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Repo list */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Loading repositories…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">No repositories found</p>
                  {search && (
                    <button onClick={() => setSearch('')} className="text-xs text-accent mt-1 hover:underline underline-offset-2">
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto -mx-1 px-1">
                  {filtered.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => selectRepo(repo)}
                      className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-[#1e1e1e] transition-all group flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Repo icon placeholder */}
                        <div className="w-7 h-7 rounded-md bg-white/5 border border-border flex-shrink-0 flex items-center justify-center">
                          <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{repo.name}</p>
                            {repo.isPrivate && (
                              <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{repo.fullName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {repo.language && (
                          <span
                            className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                              LANG_COLORS[repo.language] ?? DEFAULT_LANG_COLOR,
                            )}
                          >
                            {repo.language}
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Config step — side-by-side layout */
            <div className="flex divide-x divide-[#1e1e1e] min-h-0">
              {/* Left: repo info */}
              <div className="w-56 flex-shrink-0 p-5 space-y-5">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Repository
                  </p>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-border flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{selectedRepo?.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{selectedRepo?.fullName}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRepo?.language && (
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', langColor)}>
                        {selectedRepo.language}
                      </span>
                    )}
                    {selectedRepo?.isPrivate && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-white/5 text-muted-foreground border-border flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    )}
                  </div>
                </div>

                {/* Branch display */}
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Branch
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-foreground">
                    <GitBranch className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{form.branch}</span>
                  </div>
                </div>

                {/* Service type */}
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Type
                  </p>
                  <div className="space-y-1">
                    {SERVICE_TYPES.map((t) => {
                      const Icon = t.icon
                      const isSelected = form.type === t.value
                      return (
                        <button
                          key={t.value}
                          onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all',
                            isSelected
                              ? 'bg-accent/10 border-accent/25 text-foreground'
                              : 'border-transparent hover:bg-white/[0.04] hover:border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', isSelected ? 'text-accent' : '')} />
                          <span className="text-xs font-medium">{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Right: config fields */}
              <div className="flex-1 p-5 space-y-5 overflow-y-auto">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Configuration
                </p>

                {/* Service name */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Service Name</label>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors"
                  />
                </div>

                {/* Branch select */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Branch</label>
                  <div className="relative">
                    <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <select
                      value={form.branch}
                      onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                      disabled={loadingBranches}
                      className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-accent/50 appearance-none disabled:opacity-60"
                    >
                      {branches.length > 0
                        ? branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)
                        : <option value={form.branch}>{form.branch}</option>
                      }
                    </select>
                    {loadingBranches && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Root Directory */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Root Directory</label>
                  <div className="relative">
                    <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      value={form.rootDirectory}
                      onChange={(e) => setForm((f) => ({ ...f, rootDirectory: e.target.value }))}
                      placeholder="/"
                      className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Where your app lives within the repo. Usually <code className="font-mono">/</code>.</p>
                </div>

                {/* Build System */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Build System</label>
                  <select
                    value={form.buildSystem}
                    onChange={(e) => setForm((f) => ({ ...f, buildSystem: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 appearance-none"
                  >
                    <option value="railpack">Railpack (auto-detect)</option>
                    <option value="dockerfile">Dockerfile</option>
                    <option value="static">Static site</option>
                  </select>
                </div>

                {/* Port — only for web services */}
                {form.type === 'web' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Port</label>
                    <input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
                      className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">The port your app listens on inside the container.</p>
                  </div>
                )}

                {/* Health Check — only for web services */}
                {form.type === 'web' && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Health Check Path</label>
                    <input
                      value={form.healthCheckPath}
                      onChange={(e) => setForm((f) => ({ ...f, healthCheckPath: e.target.value }))}
                      placeholder="/health"
                      className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm outline-none focus:border-accent/50 transition-colors"
                    />
                  </div>
                )}

                {/* Auto Deploy toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-medium">Auto Deploy on Push</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Re-deploy when you push to this branch</p>
                  </div>
                  <button
                    onClick={() => setForm((f) => ({ ...f, autoDeploy: !f.autoDeploy }))}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                      form.autoDeploy ? 'bg-accent' : 'bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
                        form.autoDeploy ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1e1e1e] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button
            onClick={step === 'config' ? () => setStep('repo') : onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-lg transition-all"
          >
            {step === 'config' ? 'Back' : 'Cancel'}
          </button>

          {step === 'config' && (
            <button
              onClick={deploy}
              disabled={deploying || !form.name.trim()}
              className={cn(
                'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all',
                'bg-accent text-black hover:bg-accent/90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {deploying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Rocket className="w-3.5 h-3.5" />
              )}
              {deploying ? 'Deploying…' : 'Deploy'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
