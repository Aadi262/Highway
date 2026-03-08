'use client'

import Link from 'next/link'
import { timeAgo, statusDot } from '@/lib/utils'
import { Trash2, GitBranch, Box } from 'lucide-react'
import { projectsApi } from '@/lib/api'
import { toast } from 'sonner'

interface Props {
  project: any
  onDelete: () => void
}

export function ProjectCard({ project, onDelete }: Props) {
  const serviceCount = project.services?.length ?? 0
  const dbCount = project.databases?.length ?? 0

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm(`Delete project "${project.name}"? All services and databases will be removed.`)) return
    try {
      await projectsApi.delete(project.id)
      toast.success('Project deleted')
      onDelete()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-surface border border-border rounded-lg p-5 hover:border-white/20 transition-colors group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-sm">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger transition-all p-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Box className="w-3 h-3" />
          {serviceCount} service{serviceCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <GitBranch className="w-3 h-3" />
          {dbCount} DB{dbCount !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Created {timeAgo(project.createdAt)}
      </p>
    </Link>
  )
}
