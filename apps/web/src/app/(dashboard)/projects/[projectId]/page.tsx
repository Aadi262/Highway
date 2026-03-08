'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { projectsApi, servicesApi } from '@/lib/api'
import { ServiceCard } from '@/components/service/ServiceCard'
import { DatabaseCard } from '@/components/database/DatabaseCard'
import { AddServiceModal } from '@/components/service/AddServiceModal'
import { AddDatabaseModal } from '@/components/database/AddDatabaseModal'
import { ServiceGraph } from '@/components/service/ServiceGraph'
import { Plus, Loader2, ArrowLeft, Database, Box } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (!project) return <div className="p-8 text-muted-foreground">Project not found</div>

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/projects" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddDb(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-2 rounded transition-colors"
          >
            <Database className="w-4 h-4" />
            Add Database
          </button>
          <button
            onClick={() => setShowAddService(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        </div>
      </div>

      {/* Service Topology Graph */}
      {(project.services?.length > 0 || project.databases?.length > 0) && (
        <div className="mb-8">
          <ServiceGraph
            projectId={projectId}
            services={(project.services ?? []).map((s: any) => ({ id: s.id, name: s.name, type: 'app', status: s.status, slug: s.slug }))}
            databases={(project.databases ?? []).map((d: any) => ({ id: d.id, name: d.name, type: 'database', status: d.status }))}
          />
        </div>
      )}

      {/* Services */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Services ({project.services?.length ?? 0})
        </h2>
        {project.services?.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
            No services yet —{' '}
            <button onClick={() => setShowAddService(true)} className="text-accent underline-offset-2 hover:underline">
              add one
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {project.services?.map((s: any) => (
              <ServiceCard key={s.id} service={s} projectId={projectId} onUpdate={load} />
            ))}
          </div>
        )}
      </section>

      {/* Databases */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Databases ({project.databases?.length ?? 0})
        </h2>
        {project.databases?.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
            No databases —{' '}
            <button onClick={() => setShowAddDb(true)} className="text-accent underline-offset-2 hover:underline">
              provision one
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {project.databases?.map((d: any) => (
              <DatabaseCard key={d.id} database={d} onUpdate={load} />
            ))}
          </div>
        )}
      </section>

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
