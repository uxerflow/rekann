import server from '@tanstack/react-start/server-entry'
import { readConfig } from './server/config'
import { connectDatabase } from './server/db'
import { processWaitlist } from './server/waitlist'
import { compactMemory } from './server/ai/memory'

async function deliver(env: Env) {
  const config = readConfig(env)
  const connection = connectDatabase(config.DATABASE_URL)
  try {
    await processWaitlist(connection.db, config)
  } finally {
    await connection.close()
  }
}
async function maintainAI(env: Env) {
  const connection = connectDatabase(readConfig(env).DATABASE_URL)
  try {
    await compactMemory(connection.db)
  } finally {
    await connection.close()
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const marketing = (env as unknown as { SITE_MODE?: string }).SITE_MODE === 'waitlist'
    if (marketing && url.hostname === 'www.rekann.app')
      return Response.redirect(`https://rekann.app${url.pathname}${url.search}`, 308)
    if (url.pathname === '/robots.txt')
      return new Response(
        marketing
          ? 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /unsubscribe\n'
          : 'User-agent: *\nDisallow: /\n',
        { headers: { 'content-type': 'text/plain' } },
      )
    // The marketing Worker never exposes app registration, sessions, or workspace routes.
    if (
      marketing &&
      !['/', '/waitlist', '/unsubscribe'].includes(url.pathname) &&
      !url.pathname.startsWith('/api/waitlist/') &&
      !url.pathname.startsWith('/_serverFn/') &&
      !url.pathname.startsWith('/assets/')
    )
      return new Response('Not found', { status: 404 })
    const response = await server.fetch(request)
    if (!marketing) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    if (request.method === 'POST' && url.pathname.startsWith('/api/waitlist/') && response.ok) {
      // Own pool: response lifecycle cleanup must not close the background job's sockets.
      ctx.waitUntil(
        deliver(env).catch(() => {
          console.error('Waitlist background delivery deferred.')
        }),
      )
    }
    return response
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      env.SITE_MODE !== 'waitlist' && _event.cron === '17 * * * *' ? maintainAI(env) : deliver(env),
    )
  },
} satisfies ExportedHandler<Env>
