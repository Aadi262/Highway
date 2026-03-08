import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  })
  return drizzle(client, { schema, logger: process.env.NODE_ENV === 'development' })
}

export type Database = ReturnType<typeof createDb>

export * from './schema'
export {
  sql,
  eq,
  and,
  or,
  desc,
  asc,
  inArray,
  isNull,
  isNotNull,
  count,
  ne,
  lt,
  lte,
  gt,
  gte,
  not,
  like,
} from 'drizzle-orm'
