'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { volumesApi } from '@/lib/api'
import { Plus, Trash2, HardDrive, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function VolumesPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const [volumes, setVolumes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', mountPath: '', sizeGb: 1 })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const list = await volumesApi.list(serviceId)
      setVolumes(list)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [serviceId])

  async function addVolume() {
    if (!form.name || !form.mountPath) return
    setSaving(true)
    try {
      await volumesApi.create(serviceId, form)
      toast.success('Volume added — redeployment required for changes to take effect')
      setShowAdd(false)
      setForm({ name: '', mountPath: '', sizeGb: 1 })
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteVolume(id: string) {
    if (!confirm('Delete this volume? ALL DATA WILL BE PERMANENTLY LOST.')) return
    try {
      await volumesApi.delete(id)
      toast.success('Volume deleted')
      load()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Volumes</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-xs px-3 py-1.5 bg-accent hover:bg-accent/90 text-black font-medium rounded"
        >
          <Plus className="w-3.5 h-3.5" /> Add Volume
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium">New Volume</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="my-data"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Size (GB)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.sizeGb}
                onChange={e => setForm(f => ({ ...f, sizeGb: parseInt(e.target.value) || 1 }))}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mount Path</label>
            <input
              value={form.mountPath}
              onChange={e => setForm(f => ({ ...f, mountPath: e.target.value }))}
              placeholder="/app/data"
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-yellow-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            Requires redeployment to take effect
          </div>

          <div className="flex gap-2">
            <button
              onClick={addVolume}
              disabled={saving || !form.name || !form.mountPath}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-black text-sm font-medium rounded disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Volume
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Volume list */}
      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : volumes.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          No volumes — add one to persist data across deployments
        </div>
      ) : (
        <div className="space-y-2">
          {volumes.map((vol: any) => (
            <div key={vol.id} className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{vol.name}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{vol.mountPath}</span>
                    <span>{vol.sizeGb} GB</span>
                    {vol.dockerVolumeName && (
                      <span className="font-mono text-[10px]">{vol.dockerVolumeName}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => deleteVolume(vol.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors"
                title="Delete volume (data will be lost)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
