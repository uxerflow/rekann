import { env } from 'cloudflare:workers'
import { ZodError } from 'zod'
import { readConfig } from './config'
import { connectDatabase } from './db'
import { createAuth } from './auth'
import { AppError } from './workspaces'

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  })
}
export async function withRuntime(
  run: (context: {
    db: ReturnType<typeof connectDatabase>['db']
    auth: ReturnType<typeof createAuth>
    config: ReturnType<typeof readConfig>
    media: R2Bucket
  }) => Promise<Response>,
) {
  let connection: ReturnType<typeof connectDatabase> | undefined
  try {
    const config = readConfig(env)
    connection = connectDatabase(config.DATABASE_URL)
    return await run({
      db: connection.db,
      auth: createAuth(connection.db, config),
      config,
      media: env.MEDIA,
    })
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status)
    if (error instanceof ZodError && connection)
      return json(
        { error: error.issues[0]?.message ?? 'Check the information and try again.' },
        400,
      )
    return json({ error: 'Something went wrong. Please try again shortly.' }, 503)
  } finally {
    await connection?.close()
  }
}
