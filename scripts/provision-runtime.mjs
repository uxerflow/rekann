import { neon } from '@neondatabase/serverless'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'

// One-time local development provisioning, using the database owner connection.
// Production roles should be provisioned explicitly in the production database.
const config = parseEnv(readFileSync('.dev.vars', 'utf8'))
if (config.APP_ENV !== 'local' || new URL(config.BETTER_AUTH_URL).hostname !== '127.0.0.1')
  throw new Error('This script only provisions a local development database.')
if (existsSync('.env.migrations'))
  throw new Error('Migration credentials already exist. Review the existing configuration first.')
const sql = neon(config.DATABASE_URL)
const [existing] = await sql`select rolname from pg_roles where rolname = 'rekann_runtime'`
if (existing) throw new Error('The runtime role already exists. No credentials were changed.')
const password = randomBytes(32).toString('hex')
await sql.query(`CREATE ROLE rekann_runtime LOGIN PASSWORD '${password}'`)
await sql`GRANT USAGE ON SCHEMA public TO rekann_runtime`
await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON auth_user, auth_session, auth_account, auth_verification, auth_rate_limit, workspace, workspace_member, workspace_invitation TO rekann_runtime`
await sql`GRANT INSERT ON audit_event TO rekann_runtime`
const connection = new URL(config.DATABASE_URL)
connection.username = 'rekann_runtime'
connection.password = password
writeFileSync('.env.migrations', `DATABASE_URL=${config.DATABASE_URL}\n`, { mode: 0o600 })
writeFileSync(
  '.dev.vars',
  Object.entries({ ...config, DATABASE_URL: connection.toString() })
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
  { mode: 0o600 },
)
console.log(
  'Runtime role created with application-table permissions. Owner credentials saved separately for migrations.',
)
