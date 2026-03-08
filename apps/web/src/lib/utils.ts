import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function statusColor(status: string) {
  switch (status) {
    case 'running':
    case 'success': return 'text-accent'
    case 'building':
    case 'deploying':
    case 'queued': return 'text-warning'
    case 'failed':
    case 'error':
    case 'crashed': return 'text-danger'
    case 'stopped':
    case 'idle': return 'text-muted-foreground'
    default: return 'text-muted-foreground'
  }
}

export function statusDot(status: string) {
  switch (status) {
    case 'running': return 'bg-accent status-running'
    case 'building':
    case 'deploying': return 'bg-warning animate-pulse'
    case 'failed':
    case 'error': return 'bg-danger'
    case 'stopped': return 'bg-muted'
    default: return 'bg-muted-foreground'
  }
}
