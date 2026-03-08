import { redis } from '../lib/redis'
import { db } from '../lib/db'
import { deploymentLogs } from '@highway/db'
import { eq, asc } from 'drizzle-orm'
import { REDIS_KEYS, LIMITS, type LogEntry } from '@highway/shared'

export const logService = {
  async appendLog(deploymentId: string, line: string, stream: LogEntry['stream'] = 'system') {
    const entry: LogEntry = {
      line,
      timestamp: new Date().toISOString(),
      stream,
    }
    const serialized = JSON.stringify(entry)

    // 1. Persist to database (permanent, survives Redis restart)
    await db.insert(deploymentLogs).values({
      deploymentId,
      content: line,
      stream,
    }).catch(() => {}) // never fail the pipeline if DB write fails

    // 2. Ring buffer in Redis (fast read for live tail)
    await redis.rpush(REDIS_KEYS.logBuffer(deploymentId), serialized)
    await redis.ltrim(REDIS_KEYS.logBuffer(deploymentId), -LIMITS.MAX_LOG_LINES_BUFFERED, -1)

    // 3. Publish for live SSE subscribers
    await redis.publish(REDIS_KEYS.logChannel(deploymentId), serialized)
  },

  // Read from DB first (persistent), fall back to Redis ring buffer
  async getRecentLogs(deploymentId: string, count = 500): Promise<LogEntry[]> {
    const rows = await db.select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId))
      .orderBy(asc(deploymentLogs.timestamp))
      .limit(count)
      .catch(() => [])

    if (rows.length > 0) {
      return rows.map((r) => ({
        line: r.content,
        timestamp: r.timestamp.toISOString(),
        stream: r.stream as LogEntry['stream'],
      }))
    }

    // Fallback: Redis ring buffer (for in-progress builds before DB write)
    const raw = await redis.lrange(REDIS_KEYS.logBuffer(deploymentId), -count, -1)
    return raw.map((r) => {
      try { return JSON.parse(r) as LogEntry } catch { return { line: r, timestamp: new Date().toISOString(), stream: 'system' as const } }
    })
  },

  async clearLogs(deploymentId: string) {
    await redis.del(REDIS_KEYS.logBuffer(deploymentId))
  },
}

// Helper used throughout the build/deploy pipeline
export async function log(id: string, line: string, stream: LogEntry['stream'] = 'system') {
  await logService.appendLog(id, line, stream)
  console.log(`[deploy:${id.slice(0, 8)}] ${line.replace(/\x1b\[[0-9;]*m/g, '')}`)
}
