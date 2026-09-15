import { expect, request, type APIRequestContext } from '@playwright/test'
export const origin = 'http://127.0.0.1:3000'
export const password = 'Rekann Testing Passphrase 2026!'
let count = 20
export async function client() {
  return request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { origin, 'x-forwarded-for': `198.51.100.${count++}` },
  })
}
export const uniqueEmail = (label: string) =>
  `e2e-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
export async function emailMessage(email: string) {
  const response = await fetch(`http://127.0.0.1:8025/messages?to=${encodeURIComponent(email)}`)
  const messages = (await response.json()) as { text: string }[]
  expect(messages.length).toBeGreaterThan(0)
  return messages.at(-1)!.text
}
export async function otp(email: string) {
  return (await emailMessage(email)).match(/\b\d{6}\b/)![0]
}
export async function register(ctx: APIRequestContext, email: string) {
  const result = await ctx.post('/api/auth/sign-up/email', {
    data: { email, password, name: 'Test Person' },
  })
  expect(result.status()).toBe(200)
}
export async function verified(ctx: APIRequestContext, email: string) {
  await register(ctx, email)
  expect(
    (
      await ctx.post('/api/auth/email-otp/verify-email', { data: { email, otp: await otp(email) } })
    ).status(),
  ).toBe(200)
}
export async function post(ctx: APIRequestContext, operation: string, data: unknown, status = 200) {
  const response = await ctx.post(`/api/app/${operation}`, { data })
  expect(response.status(), `Unexpected status for ${operation}`).toBe(status)
  return response.json()
}
export async function company(ctx: APIRequestContext, name: string) {
  return (
    await post(ctx, 'workspace/create', {
      name,
      description: 'A workspace created by automated testing.',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Asia/Jakarta',
    })
  ).id as string
}
export async function profile(ctx: APIRequestContext, workspaceId: string, firstName = 'Alex') {
  return post(ctx, 'profile/save', {
    workspaceId,
    firstName,
    lastName: 'Carter',
    jobTitle: 'Designer',
    phone: '',
    birthPlace: '',
    birthDate: '',
  })
}
export async function details(ctx: APIRequestContext, workspaceId: string) {
  const response = await ctx.get(`/api/app/workspace?id=${workspaceId}`)
  expect(response.status()).toBe(200)
  return response.json()
}
export async function invite(
  ctx: APIRequestContext,
  workspaceId: string,
  email: string,
  role = 'employee',
) {
  await post(ctx, 'invitation/create', { workspaceId, email, role })
  return (await emailMessage(email)).match(/\/invite\/([a-f0-9]{64})/)![1]
}
