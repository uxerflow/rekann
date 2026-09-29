export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/app/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = (await response.json()) as T & { error?: string }
  if (!response.ok)
    throw new RequestError(
      response.status,
      result.error ?? 'Something went wrong. Please try again.',
    )
  return result
}
export async function authRequest<T = { user?: { email: string } }>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = (await response.json()) as T & { message?: string; code?: string }
  if (!response.ok) {
    const message =
      response.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : result.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'The email or password is incorrect.'
          : result.code === 'EMAIL_NOT_VERIFIED'
            ? 'Verify your email before signing in.'
            : ['INVALID_OTP', 'OTP_EXPIRED', 'TOO_MANY_ATTEMPTS'].includes(result.code ?? '')
              ? 'This code is incorrect or has expired. Please try again or request a new code.'
              : response.status >= 500
                ? 'Something went wrong. Please try again shortly.'
                : (result.message ?? 'Unable to continue. Please try again.')
    throw Object.assign(new RequestError(response.status, message), { code: result.code })
  }
  return result
}
export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
export function safeNext(value: unknown) {
  if (typeof value !== 'string') return ''
  return /^\/invite\/[a-f0-9]{64}$/.test(value) ? value : ''
}
export async function signOut(destination = '/sign-in') {
  await authRequest('sign-out', {})
  window.location.assign(destination)
}
