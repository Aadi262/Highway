'use client'

import { useEffect, useState } from 'react'
import { envApi } from '@/lib/api'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, Plus, Save, Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  serviceId: string
}

interface EnvRow {
  id?: string
  key: string
  value: string
  isRevealed: boolean
  isNew: boolean
  isEdited: boolean
}

export function EnvEditor({ serviceId }: Props) {
  const [rows, setRows] = useState<EnvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')

  async function load() {
    try {
      const vars = await envApi.list(serviceId)
      setRows(vars.map((v: any) => ({
        id: v.id,
        key: v.key,
        value: '***',
        isRevealed: false,
        isNew: false,
        isEdited: false,
      })))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [serviceId])

  async function revealRow(index: number) {
    const row = rows[index]
    if (!row.id || row.isRevealed) return
    try {
      const { value } = await envApi.reveal(serviceId, row.key)
      setRows((prev) => prev.map((r, i) => i === index ? { ...r, value, isRevealed: true } : r))
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  function addRow() {
    setRows((prev) => [...prev, { key: '', value: '', isRevealed: true, isNew: true, isEdited: true }])
  }

  function removeRow(index: number) {
    const row = rows[index]
    if (row.id && !confirm(`Delete "${row.key}"?`)) return
    if (row.id) {
      envApi.delete(serviceId, row.key).then(() => toast.success(`Deleted ${row.key}`)).catch((e) => toast.error(e.message))
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRow(index: number, field: 'key' | 'value', val: string) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: val, isEdited: true } : r))
  }

  async function save() {
    const toSave = rows.filter((r) => r.isEdited && r.key.trim())
    if (toSave.length === 0) return toast.info('No changes to save')

    setSaving(true)
    try {
      const vars = Object.fromEntries(toSave.map((r) => [r.key.trim(), r.value]))
      await envApi.set(serviceId, vars)
      toast.success(`Saved ${toSave.length} variable${toSave.length !== 1 ? 's' : ''}`)
      setRows((prev) => prev.map((r) => ({ ...r, isEdited: false, isNew: false })))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function applyBulk() {
    const vars: Record<string, string> = {}
    for (const line of bulkText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    if (Object.keys(vars).length === 0) return toast.error('No valid KEY=VALUE pairs found')

    setSaving(true)
    try {
      await envApi.set(serviceId, vars)
      toast.success(`Set ${Object.keys(vars).length} variables`)
      setBulkMode(false)
      setBulkText('')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} variable{rows.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkMode(!bulkMode)}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded transition-colors',
              bulkMode ? 'border-accent text-accent' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            <Upload className="w-3 h-3" />
            Bulk .env
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
          <button
            onClick={save}
            disabled={saving || !rows.some((r) => r.isEdited)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-black rounded transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      {/* Bulk mode */}
      {bulkMode && (
        <div className="space-y-2">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="POSTGRES_URL=postgresql://...\nREDIS_URL=redis://..."
            rows={8}
            className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono outline-none focus:border-accent transition-colors resize-y"
          />
          <div className="flex gap-2">
            <button onClick={applyBulk} disabled={saving} className="text-xs px-4 py-2 bg-accent text-black rounded">Apply</button>
            <button onClick={() => setBulkMode(false)} className="text-xs px-4 py-2 border border-border text-muted-foreground rounded">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No environment variables — add one above
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal">Key</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-normal">Value</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cn('border-b border-border last:border-0', row.isEdited && 'bg-accent/5')}>
                  <td className="px-3 py-2">
                    <input
                      value={row.key}
                      onChange={(e) => updateRow(i, 'key', e.target.value)}
                      placeholder="KEY"
                      className="w-full bg-transparent font-mono outline-none placeholder:text-muted-foreground/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.isRevealed ? row.value : '•'.repeat(20)}
                      onChange={(e) => row.isRevealed && updateRow(i, 'value', e.target.value)}
                      readOnly={!row.isRevealed}
                      type="text"
                      placeholder="value"
                      className="w-full bg-transparent font-mono outline-none placeholder:text-muted-foreground/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      {row.id && (
                        <button onClick={() => revealRow(i)} className="p-1 text-muted-foreground hover:text-foreground">
                          {row.isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => removeRow(i)} className="p-1 text-muted-foreground hover:text-danger">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
