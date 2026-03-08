'use client'

import { useEffect, useState } from 'react'
import { metricsApi } from '@/lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Props {
  serviceId: string
}

const TABS = [
  { label: 'CPU', key: 'cpu', unit: '%', color: '#22C55E' },
  { label: 'Memory', key: 'memory', unit: 'MB', color: '#3B82F6' },
  { label: 'Network', key: 'network', unit: 'KB/s', color: '#F59E0B' },
]

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
]

export function MetricsChart({ serviceId }: Props) {
  const [tab, setTab] = useState('cpu')
  const [hours, setHours] = useState(1)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const raw = await metricsApi.get(serviceId, hours)
      setData(raw.reverse())
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [serviceId, hours])
  useEffect(() => {
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [serviceId, hours])

  const chartTab = TABS.find((t) => t.key === tab)!

  const chartData = data.map((d: any) => ({
    time: new Date(d.timestamp),
    cpu: d.cpuPercent != null ? d.cpuPercent / 100 : 0,
    memory: d.memoryMb ?? 0,
    network: d.networkRxBytes != null ? Math.round(Number(d.networkRxBytes) / 1024) : 0,
  }))

  return (
    <div className="space-y-4">
      {/* Tab + Range row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-1.5 text-xs rounded transition-colors',
                tab === t.key ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => setHours(r.hours)}
              className={cn(
                'px-2.5 py-1 text-xs rounded transition-colors',
                hours === r.hours ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-surface border border-border rounded-lg p-4" style={{ height: 200 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No metrics data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={`gradient-${tab}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartTab.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartTab.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#71717A' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => format(new Date(v), 'HH:mm')}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#71717A' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}${chartTab.unit}`}
              />
              <Tooltip
                contentStyle={{ background: '#18181B', border: '1px solid #27272A', borderRadius: 6, fontSize: 11 }}
                labelFormatter={(v) => format(new Date(v), 'HH:mm:ss')}
                formatter={(v: any) => [`${v}${chartTab.unit}`, chartTab.label]}
              />
              <Area
                type="monotone"
                dataKey={tab}
                stroke={chartTab.color}
                fill={`url(#gradient-${tab})`}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
