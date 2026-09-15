import { test, expect } from '@playwright/test'
import { readConfig } from '../src/server/config'
import { workspaceInput, profileInput } from '../src/shared/contracts'
import { safeNext } from '../src/lib/api'
import { readJson } from '../src/server/http'

test('validation and local email cannot weaken production configuration', () => {
  expect(() =>
    readConfig({
      DATABASE_URL: 'postgres://example',
      BETTER_AUTH_SECRET: 'a'.repeat(48),
      BETTER_AUTH_URL: 'https://app.example.com',
      APP_ENV: 'production',
      EMAIL_DELIVERY: 'local',
    }),
  ).toThrow()
  expect(
    workspaceInput.safeParse({
      name: 'Test',
      description: 'A test company',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Fake/Zone',
    }).success,
  ).toBe(false)
  expect(
    profileInput.safeParse({
      workspaceId: 'test',
      firstName: 'Test',
      lastName: 'Carter',
      jobTitle: 'Designer',
      phone: '',
      birthPlace: '',
      birthDate: '2000-02-31',
    }).success,
  ).toBe(false)
  for (const next of [
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/workspace/random',
    'javascript:alert(1)',
  ])
    expect(safeNext(next)).toBe('')
})

test('streamed JSON is bounded even without a Content-Length header', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(20_000))
    },
    cancel() {
      cancelled = true
    },
  })
  await expect(
    readJson({ body, headers: new Headers({ 'content-type': 'application/json' }) }, 16_384),
  ).rejects.toMatchObject({ status: 413 })
  expect(cancelled).toBe(true)
})
