import { z } from 'zod'

export const subscribeInput = z.object({
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address.'),
  website: z.string().max(200).nullish(),
})
const encoder = new TextEncoder()
async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
function base64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
function decode(value: string) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  )
}
export async function unsubscribeToken(id: string, secret: string) {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    encoder.encode(`waitlist:unsubscribe:${id}`),
  )
  return `${id}.${base64url(signature)}`
}
export async function verifyUnsubscribe(token: string, secret: string) {
  const match = /^([a-f\d-]{36})\.([\w-]{43})$/i.exec(token)
  if (!match || !z.uuid().safeParse(match[1]).success) return null
  try {
    return (await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      decode(match[2]),
      encoder.encode(`waitlist:unsubscribe:${match[1]}`),
    ))
      ? match[1]
      : null
  } catch {
    return null
  }
}
export async function hashClient(value: string, secret: string) {
  return base64url(
    await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`waitlist:rate:${value}`)),
  )
}
// Resend uses Svix signatures: authenticate the untouched bytes and reject old replays.
export async function verifyWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get('svix-id'),
    timestamp = headers.get('svix-timestamp'),
    signatures = headers.get('svix-signature')
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false
  try {
    const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
    const webhookKey = await crypto.subtle.importKey(
      'raw',
      decode(raw),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    for (const signature of signatures.split(' ')) {
      const [version, bytes] = signature.split(',')
      if (
        version === 'v1' &&
        bytes &&
        (await crypto.subtle.verify(
          'HMAC',
          webhookKey,
          decode(bytes),
          encoder.encode(`${id}.${timestamp}.${body}`),
        ))
      )
        return true
    }
  } catch {
    return false
  }
  return false
}
