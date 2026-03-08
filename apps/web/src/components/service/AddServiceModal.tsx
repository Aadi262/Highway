'use client'

import { useEffect, useState } from 'react'
import { gitApi, servicesApi } from '@/lib/api'
import { X, Loader2, Search, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

export function AddServiceModal({ projectId, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'repo' | 'config'>('repo')
  const [repos, setRepos] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<any>(null)
  const [branches, setBranches] = useState<any[]>([])

  const [form, setForm] = useState({
    name: '',
    branch: 'main',
    buildSystem: 'railpack',
    port: 3000,
    autoDeploy: true,
    healthCheckPath: '/health',
    type: 'web',
  })

  useEffect(() => {
    gitApi.repos().then((r) => { setRepos(r); setFiltered(r) }).catch((e) => toast.error(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(repos.filter((r) => r.fullName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)))
  }, [search, repos])

  async function selectRepo(repo: any) {
    setSelectedRepo(repo)
    setForm((f) => ({ ...f, name: repo.name, branch: repo.defaultBranch ?? 'main' }))
    const [owner, name] = repo.fullName.split('/')
    const brs = await gitApi.branches(owner, name).catch(() => [])
    setBranches(brs)
    setStep('config')
  }

  async function create() {
    if (!selectedRepo || !form.name) return
    setCreating(true)
    try {
      await servicesApi.create(projectId, {
        name: form.name,
        type: form.type,
        gitRepoId: selectedRepo.id,
        gitRepoUrl: selectedRepo.cloneUrl,
        gitRepoName: selectedRepo.fullName,
        gitBranch: form.branch,
        buildSystem: form.buildSystem,
        port: form.port,
        autoDeploy: form.autoDeploy,
        healthCheckPath: form.healthCheckPath || undefined,
      })
      toast.success(`Service "${form.name}" created`)
      onCreated()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">
            {step === 'repo' ? 'Connect Repository' : `Configure ${selectedRepo?.name}`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {step === 'repo' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full bg-background border border-border rounded pl-9 pr-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {filtered.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => selectRepo(repo)}
                      className="w-full text-left px-3 py-2.5 rounded hover:bg-white/5 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm">{repo.fullName}</p>
                        <p className="text-xs text-muted-foreground">{repo.language} · {repo.defaultBranch}</p>
                      </div>
                      {repo.isPrivate && <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">Private</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Service Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Branch</label>
                  <select
                    value={form.branch}
                    onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                    {branches.length === 0 && <option value={form.branch}>{form.branch}</option>}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Build System</label>
                  <select
                    value={form.buildSystem}
                    onChange={(e) => setForm((f) => ({ ...f, buildSystem: e.target.value }))}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="railpack">Railpack (auto-detect)</option>
                    <option value="dockerfile">Dockerfile</option>
                    <option value="static">Static site</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Port</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Health Check Path</label>
                  <input
                    value={form.healthCheckPath}
                    onChange={(e) => setForm((f) => ({ ...f, healthCheckPath: e.target.value }))}
                    placeholder="/health"
                    className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm">Auto Deploy on Push</p>
                  <p className="text-xs text-muted-foreground">Deploy when you push to this branch</p>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, autoDeploy: !f.autoDeploy }))}
                  className={cn('relative w-10 h-5 rounded-full transition-colors', form.autoDeploy ? 'bg-accent' : 'bg-muted')}
                >
                  <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', form.autoDeploy ? 'left-5' : 'left-0.5')} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4 flex justify-between">
          <button
            onClick={() => step === 'config' ? setStep('repo') : onClose()}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
          >
            {step === 'config' ? 'Back' : 'Cancel'}
          </button>
          {step === 'config' && (
            <button
              onClick={create}
              disabled={creating || !form.name}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent text-black font-medium rounded disabled:opacity-50"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Service
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
