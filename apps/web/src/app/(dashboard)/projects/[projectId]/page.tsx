'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { projectsApi } from '@/lib/api'
import { ServiceCard } from '@/components/service/ServiceCard'
import { DatabaseCard } from '@/components/database/DatabaseCard'
import { AddServiceModal } from '@/components/service/AddServiceModal'
import { AddDatabaseModal } from '@/components/database/AddDatabaseModal'
import {
  Plus,
  Loader2,
  ArrowLeft,
  Database,
  GitBranch,
  Layers,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAddService, setShowAddService] = useState(false)
  const [showAddDb, setShowAddDb] = useState(false)

  async function load() {
    try {
      const data = await projectsApi.get(projectId)
      setProject(data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-muted-foreground">Project not found</p>
        <Link href="/projects" className="text-sm text-accent hover:underline underline-offset-2">
          Back to projects
        </Link>
      </div>
    )
  }

  const hasServices = (project.services?.length ?? 0) > 0
  const hasDatabases = (project.databases?.length ?? 0) > 0
  const isEmpty = !hasServices && !hasDatabases

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
          <Link
            href="/projects"
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            Projects
          </Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span className="text-foreground/80">{project.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div className="flex items-start gap-4">
            {/* Project avatar */}
            <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-accent font-semibold text-sm">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">{project.description}</p>
              )}
            </div>
          </div>

          {!isEmpty && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddDb(true)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-white/20 bg-surface px-3 py-2 rounded-lg transition-all"
              >
                <Database className="w-4 h-4" />
                Add Database
              </button>
              <button
                onClick={() => setShowAddService(true)}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium px-4 py-2 rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Service
              </button>
            </div>
          )}
        </div>

        {/* Empty State */}
        {isEmpty ? (
          <div className="mt-4">
            <div className="text-center mb-10">
              <h2 className="text-lg font-semibold mb-1.5">Get started with {project.name}</h2>
              <p className="text-sm text-muted-foreground">
                Deploy your first service, provision a database, or start from a template.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Deploy from GitHub */}
              <button
                onClick={() => setShowAddService(true)}
                className={cn(
                  'group relative flex flex-col items-start gap-5 p-6 rounded-xl border border-border',
                  'bg-surface hover:bg-white/[0.03] hover:border-accent/40',
                  'transition-all duration-200 text-left cursor-pointer',
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/15 transition-colors">
                  <GitBranch className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-sm mb-1">Deploy from GitHub</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connect a repository and deploy automatically on every push.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Get started <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              {/* Add Database */}
              <button
                onClick={() => setShowAddDb(true)}
                className={cn(
                  'group relative flex flex-col items-start gap-5 p-6 rounded-xl border border-border',
                  'bg-surface hover:bg-white/[0.03] hover:border-white/15',
                  'transition-all duration-200 text-left cursor-pointer',
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-white/5 border border-border flex items-center justify-center group-hover:bg-white/8 transition-colors">
                  <Database className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <p className="font-medium text-sm mb-1">Add a Database</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Provision Postgres, MySQL, MongoDB, or Redis in seconds.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse options <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              {/* Use Template */}
              <Link
                href="/templates"
                className={cn(
                  'group relative flex flex-col items-start gap-5 p-6 rounded-xl border border-border',
                  'bg-surface hover:bg-white/[0.03] hover:border-white/15',
                  'transition-all duration-200',
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-white/5 border border-border flex items-center justify-center group-hover:bg-white/8 transition-colors">
                  <Layers className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <p className="font-medium text-sm mb-1">Use a Template</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Deploy a pre-configured stack like Next.js + Postgres instantly.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse templates <ChevronRight className="w-3 h-3" />
                </div>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Services Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium">Services</h2>
                  <span className="text-xs font-medium text-muted-foreground bg-white/5 border border-border rounded-full px-2 py-0.5 tabular-nums">
                    {project.services?.length ?? 0}
                  </span>
                </div>
                <button
                  onClick={() => setShowAddService(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Service
                </button>
              </div>

              {!hasServices ? (
                <button
                  onClick={() => setShowAddService(true)}
                  className="w-full border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm hover:border-white/20 hover:text-foreground transition-all group"
                >
                  <GitBranch className="w-5 h-5 mx-auto mb-2 opacity-40 group-hover:opacity-60 transition-opacity" />
                  <p>No services yet — <span className="text-accent hover:underline underline-offset-2">deploy one</span></p>
                </button>
              ) : (
                <div className="space-y-2">
                  {project.services.map((s: any) => (
                    <ServiceCard key={s.id} service={s} projectId={projectId} onUpdate={load} />
                  ))}
                </div>
              )}
            </section>

            {/* Databases Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium">Databases</h2>
                  <span className="text-xs font-medium text-muted-foreground bg-white/5 border border-border rounded-full px-2 py-0.5 tabular-nums">
                    {project.databases?.length ?? 0}
                  </span>
                </div>
                <button
                  onClick={() => setShowAddDb(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Database
                </button>
              </div>

              {!hasDatabases ? (
                <button
                  onClick={() => setShowAddDb(true)}
                  className="w-full border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-sm hover:border-white/20 hover:text-foreground transition-all group"
                >
                  <Database className="w-5 h-5 mx-auto mb-2 opacity-40 group-hover:opacity-60 transition-opacity" />
                  <p>No databases yet — <span className="text-accent hover:underline underline-offset-2">provision one</span></p>
                </button>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {project.databases.map((d: any) => (
                    <DatabaseCard key={d.id} database={d} onUpdate={load} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showAddService && (
        <AddServiceModal
          projectId={projectId}
          onClose={() => setShowAddService(false)}
          onCreated={load}
        />
      )}
      {showAddDb && (
        <AddDatabaseModal
          projectId={projectId}
          onClose={() => setShowAddDb(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
