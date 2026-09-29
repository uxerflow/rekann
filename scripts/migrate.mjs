import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import ws from 'ws'
neonConfig.webSocketConstructor = ws
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations.')
if (process.env.APP_ENV !== 'local' && !process.argv.includes('--production'))
  throw new Error('Production migrations require --production.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  console.log('Database migrations applied.')
} catch {
  console.error('Migration failed. Verify database credentials and migration state.')
  process.exitCode = 1
} finally {
  await pool.end()
}
