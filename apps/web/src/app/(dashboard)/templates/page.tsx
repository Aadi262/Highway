'use client'

import { useEffect, useState } from 'react'
import { templatesApi, projectsApi } from '@/lib/api'
import { Layers, Loader2, X, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  framework: 'Framework',
  cms: 'CMS',
  automation: 'Automation',
  tool: 'Tool',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [projectId, setProjectId] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState<any>(null)

  useEffect(() => {
    Promise.all([templatesApi.list(), projectsApi.list()])
      .then(([tpls, prjs]) => {
        setTemplates(tpls)
        setProjects(prjs)
        if (prjs[0]) setProjectId(prjs[0].id)
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function deploy() {
    if (!selected || !projectId) return
    setDeploying(true)
    setDeployed(null)
    try {
      const result = await templatesApi.deploy(selected.slug, projectId)
      setDeployed(result)
      toast.success(`${selected.name} deployed!`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeploying(false)
    }
  }

  const grouped = templates.reduce((acc: Record<string, any[]>, t) => {
    const cat = t.category ?? 'other'
    acc[cat] = [...(acc[cat] ?? []), t]
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">Deploy pre-configured stacks with one click</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((tpl: any) => (
                  <button
                    key={tpl.slug}
                    onClick={() => setSelected(tpl)}
                    className={cn(
                      'bg-surface border rounded-lg p-5 text-left transition-all hover:border-accent/50 hover:shadow-lg',
                      selected?.slug === tpl.slug ? 'border-accent' : 'border-border'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{tpl.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tpl.description}</p>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {tpl.services?.map((s: any) => (
                            <span
                              key={s.name}
                              className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground"
                            >
                              {s.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deploy Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !deploying && setSelected(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-surface border border-border rounded-xl w-full max-w-md p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selected.icon}</span>
                <div>
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{selected.description}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Services list */}
            <div className="mb-5 space-y-1.5">
              {selected.services?.map((s: any) => (
                <div key={s.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-foreground">{s.type === 'database' ? '⬡' : '□'}</span>
                  <span>{s.name}</span>
                  {s.dbEngine && <span className="text-accent">{s.dbEngine}</span>}
                  {s.dockerImage && <span className="font-mono">{s.dockerImage}:{s.dockerTag ?? 'latest'}</span>}
                  {s.linkTo && <span className="text-muted-foreground">→ links to {s.linkTo}</span>}
                </div>
              ))}
            </div>

            {/* Project select */}
            {!deployed && (
              <div className="mb-5">
                <label className="text-xs text-muted-foreground mb-1.5 block">Deploy to project</label>
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No projects — create one first</p>
                ) : (
                  <div className="relative">
                    <select
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                      className="w-full bg-background border border-border rounded px-3 py-2 text-sm appearance-none outline-none focus:border-accent"
                    >
                      {projects.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            {/* Deployed result */}
            {deployed && (
              <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs space-y-1">
                <p className="text-green-400 font-medium">Deployed successfully!</p>
                <p className="text-muted-foreground">{deployed.services?.length ?? 0} service(s), {deployed.databases?.length ?? 0} database(s) provisioned</p>
                <p className="text-muted-foreground">Build queued — check the project for status</p>
              </div>
            )}

            <div className="flex gap-2">
              {!deployed ? (
                <>
                  <button
                    onClick={deploy}
                    disabled={deploying || !projectId}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium rounded disabled:opacity-50"
                  >
                    {deploying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {deploying ? 'Deploying...' : `Deploy ${selected.name}`}
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="px-4 py-2 text-sm text-muted-foreground border border-border rounded hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelected(null)}
                  className="flex-1 py-2 bg-surface border border-border text-sm rounded hover:text-foreground"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
