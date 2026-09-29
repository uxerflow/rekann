import { createFileRoute } from '@tanstack/react-router'
import { json, withRuntime } from '../server/runtime'
import { readJson } from '../server/http'

async function handle({ request }: { request: Request }) {
  return withRuntime(async ({ auth }) => {
    // Expose only the chosen email/password flows. Plugin helper endpoints must not
    // accidentally enable passwordless sign-in or passwordless password changes.
    const path = new URL(request.url).pathname.replace('/api/auth', '')
    const allowed = new Set([
      '/sign-up/email',
      '/sign-in/email',
      '/sign-out',
      '/get-session',
      '/list-sessions',
      '/revoke-session',
      '/revoke-other-sessions',
      '/email-otp/send-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
    ])
    if (!allowed.has(path)) return json({ error: 'Not found.' }, 404)
    let authRequest = request
    if (request.method === 'POST') {
      const body = await readJson(request, 16_384)
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return json({ error: 'Invalid request.' }, 400)
      if (
        path === '/email-otp/send-verification-otp' &&
        (!('type' in body) || body.type !== 'email-verification')
      )
        return json({ error: 'Unsupported verification request.' }, 400)
      const headers = new Headers(request.headers)
      headers.delete('content-length')
      authRequest = new Request(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    }
    const response = await auth.handler(authRequest)
    response.headers.set('cache-control', 'no-store')
    return response
  })
}
export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handle, POST: handle } },
})
