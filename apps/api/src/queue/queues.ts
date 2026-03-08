import { Queue } from 'bullmq'
import { queueConnection } from './connection'
import { QUEUES } from '@highway/shared'
import type { BuildJobPayload, DeployJobPayload } from '@highway/shared'

export const buildQueue = new Queue<BuildJobPayload>(QUEUES.BUILD, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const deployQueue = new Queue<DeployJobPayload>(QUEUES.DEPLOY, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const cleanupQueue = new Queue(QUEUES.CLEANUP, {
  connection: queueConnection,
})

export const metricsQueue = new Queue(QUEUES.METRICS, {
  connection: queueConnection,
})
