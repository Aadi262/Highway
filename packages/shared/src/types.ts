// Shared types used across apps/api and apps/web

export interface LogEntry {
  line: string
  timestamp: string
  stream: 'stdout' | 'stderr' | 'system'
}

export interface ContainerStats {
  cpuPercent: number
  memoryMb: number
  memoryLimitMb: number
  networkRxBytes: number
  networkTxBytes: number
  diskReadBytes: number
  diskWriteBytes: number
}

export interface BuildJobPayload {
  serviceId: string
  trigger: 'push' | 'manual' | 'api' | 'redeploy' | 'rollback'
  commitHash?: string
  commitMessage?: string
  commitAuthor?: string
  branch?: string
  deploymentId?: string
  rollbackImageName?: string
}

export interface DeployJobPayload {
  serviceId: string
  deploymentId: string
  imageName: string
  envVars: string[]
}

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
