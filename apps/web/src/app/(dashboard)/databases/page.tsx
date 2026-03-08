'use client'

import { useEffect, useState } from 'react'
import { databasesApi } from '@/lib/api'
import { DatabaseCard } from '@/components/database/DatabaseCard'
import { Loader2, Database } from 'lucide-react'
import { toast } from 'sonner'

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await databasesApi.listAll()
      setDatabases(data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const byType = databases.reduce((acc: Record<string, number>, db) => {
    acc[db.type] = (acc[db.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Databases</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {databases.length} database{databases.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
      </div>

      {/* Stats */}
      {databases.length > 0 && (
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          {Object.entries(byType).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-4 py-2.5">
              <span className="text-base">{DB_ICONS[type] ?? '🗄️'}</span>
              <span className="text-sm capitalize">{type}</span>
              <span className="text-xs text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : databases.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Database className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium text-foreground">No databases yet</p>
          <p className="text-sm mt-1">
            Provision databases from within a project
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {databases.map((db) => (
            <DatabaseCard key={db.id} database={db} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}

const DB_ICONS: Record<string, string> = {
  postgresql: '🐘',
  mysql: '🐬',
  mongodb: '🍃',
  redis: '🔴',
  mariadb: '🦭',
}
