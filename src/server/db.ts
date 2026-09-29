import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

// A pool belongs to one request: Workers must not reuse another request's sockets.
export function connectDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000 })
  return { db: drizzle(pool, { schema }), close: () => pool.end() }
}
export type Database = ReturnType<typeof connectDatabase>['db']
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
