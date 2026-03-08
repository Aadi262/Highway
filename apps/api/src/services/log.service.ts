import { redis } from '../lib/redis'
import { REDIS_KEYS, LIMITS, type LogEntry } from '@highway/shared'

export const logService = {
  async appendLog(id: string, line: string, stream: LogEntry['stream'] = 'system') {
    const entry: LogEntry = {
      line,
      timestamp: new Date().toISOString(),
      stream,
    }
    const serialized = JSON.stringify(entry)
    // Ring buffer in Redis
    await redis.rpush(REDIS_KEYS.logBuffer(id), serialized)
    await redis.ltrim(REDIS_KEYS.logBuffer(id), -LIMITS.MAX_LOG_LINES_BUFFERED, -1)
    // Publish for live SSE subscribers
    await redis.publish(REDIS_KEYS.logChannel(id), serialized)
  },

  async getRecentLogs(id: string, count = 200): Promise<LogEntry[]> {
    const raw = await redis.lrange(REDIS_KEYS.logBuffer(id), -count, -1)
    return raw.map((r) => {
      try { return JSON.parse(r) as LogEntry } catch { return { line: r, timestamp: new Date().toISOString(), stream: 'system' as const } }
    })
  },

  async clearLogs(id: string) {
    await redis.del(REDIS_KEYS.logBuffer(id))
  },
}

// Helper used throughout the build/deploy pipeline
export async function log(id: string, line: string, stream: LogEntry['stream'] = 'system') {
  await logService.appendLog(id, line, stream)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${id.slice(0, 8)}] ${line}`)
  }
}
