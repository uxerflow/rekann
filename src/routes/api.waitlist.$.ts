import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { json, withRuntime } from '../server/runtime'
import { readJson } from '../server/http'
import { limitAction } from '../server/workspaces'
import { hashClient, verifyWebhook } from '../server/waitlist-security'
import { subscribe, unsubscribe, suppress } from '../server/waitlist'

async function boundedText(request: Request, max: number) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}
async function handle({ request }: { request: Request }) {
  return withRuntime(async ({ db, config }) => {
    const url = new URL(request.url)
    const operation = url.pathname.replace('/api/waitlist/', '')
    const secret =
      config.WAITLIST_TOKEN_SECRET || (config.APP_ENV === 'local' ? config.BETTER_AUTH_SECRET : '')
    if (!secret)
      return json({ error: 'The waitlist is not ready yet. Please try again shortly.' }, 503)
    if (operation === 'webhook') {
      if (!config.RESEND_WEBHOOK_SECRET) return json({ error: 'Not configured.' }, 503)
      const raw = await boundedText(request, 32_768)
      if (raw === null) return json({ error: 'Request is too large.' }, 413)
      if (!(await verifyWebhook(raw, request.headers, config.RESEND_WEBHOOK_SECRET)))
        return json({ error: 'Invalid signature.' }, 401)
      let event: z.infer<typeof webhook>
      try {
        event = webhook.parse(JSON.parse(raw))
      } catch {
        return json({ error: 'Invalid event.' }, 400)
      }
      if (event.type === 'contact.updated' && event.data.unsubscribed === true && event.data.email)
        await suppress(db, [event.data.email], 'unsubscribed')
      if (['email.bounced', 'email.complained', 'email.suppressed'].includes(event.type))
        await suppress(db, event.data.to || [], 'suppressed')
      if (event.type === 'suppression.added' && event.data.email)
        await suppress(db, [event.data.email], 'suppressed')
      return json({ received: true })
    }
    // RFC 8058 POST is intentionally origin-free: possession of the signed token is required.
    if (
      operation === 'unsubscribe' &&
      request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')
    ) {
      const body = await boundedText(request, 256)
      if (body === null || new URLSearchParams(body).get('List-Unsubscribe') !== 'One-Click')
        return json({ error: 'Invalid request.' }, 400)
      return json(await unsubscribe(db, url.searchParams.get('token') || '', secret))
    }
    const expectedOrigin =
      config.APP_ENV === 'local'
        ? new URL(config.BETTER_AUTH_URL).origin
        : new URL(config.WAITLIST_URL).origin
    if (request.headers.get('origin') !== expectedOrigin)
      return json({ error: 'This request is not allowed.' }, 403)
    const body = await readJson(request, 2048)
    if (operation === 'subscribe') {
      // Trust the edge-provided IP only. Never trust client-supplied X-Forwarded-For.
      const client = request.headers.get('cf-connecting-ip') || 'local'
      await limitAction(db, await hashClient(client, secret), 'waitlist-subscribe', 5)
      return json(await subscribe(db, body))
    }
    if (operation === 'unsubscribe')
      return json(
        await unsubscribe(db, z.object({ token: z.string().max(128) }).parse(body).token, secret),
      )
    return json({ error: 'Not found.' }, 404)
  })
}
const webhook = z.object({
  type: z.string(),
  data: z
    .object({
      email: z.email().optional(),
      unsubscribed: z.boolean().optional(),
      to: z.array(z.email()).max(100).optional(),
    })
    .passthrough(),
})
export const Route = createFileRoute('/api/waitlist/$')({
  server: {
    handlers: {
      POST: handle,
      GET: () => new Response(null, { status: 405, headers: { Allow: 'POST' } }),
    },
  },
})
