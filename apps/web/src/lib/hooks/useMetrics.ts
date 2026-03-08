import { useState, useEffect, useCallback } from 'react'
import { metricsApi } from '@/lib/api'

type TimeRange = '1h' | '6h' | '24h' | '7d'

const RANGE_HOURS: Record<TimeRange, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 168,
}

export function useMetrics(serviceId: string) {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')

  const fetch = useCallback(async () => {
    if (!serviceId) return
    try {
      const result = await metricsApi.get(serviceId, RANGE_HOURS[timeRange])
      setData(result)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [serviceId, timeRange])

  useEffect(() => {
    setIsLoading(true)
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => clearInterval(interval)
  }, [fetch])

  return { data, isLoading, error, timeRange, setTimeRange }
}
