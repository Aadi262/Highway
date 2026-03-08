'use client'

import { useState } from 'react'
import { projectsApi } from '@/lib/api'
import { toast } from 'sonner'
import { X, Loader2 } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: (project: any) => void
}

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const project = await projectsApi.create({ name: name.trim(), description: description.trim() || undefined })
      toast.success(`Project "${project.name}" created`)
      onCreated(project)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Project Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-saas-app"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Description <span className="text-muted-foreground/50">(optional)</span></label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this project do?"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-medium rounded transition-colors"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
