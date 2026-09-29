import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import { readConfig } from '../src/server/config'
import { subscribe, unsubscribe, suppress, processWaitlist } from '../src/server/waitlist'
import {
  subscribeInput,
  unsubscribeToken,
  verifyUnsubscribe,
  verifyWebhook,
} from '../src/server/waitlist-security'

const config = readConfig({
  DATABASE_URL: 'postgres://test:test@localhost/test',
  BETTER_AUTH_URL: 'http://127.0.0.1:4310',
  BETTER_AUTH_SECRET: 'test-only-'.repeat(8),
  WAITLIST_URL: 'http://127.0.0.1:4310',
  APP_ENV: 'local',
  EMAIL_DELIVERY: 'local',
})
const secret = config.BETTER_AUTH_SECRET
let pg: PGlite
let db: Database
const originalFetch = globalThis.fetch

test.beforeEach(async () => {
  pg = new PGlite()
  await pg.exec(readFileSync('drizzle/0004_known_longshot.sql', 'utf8'))
  db = drizzle(pg, { schema }) as unknown as Database
})
test.afterEach(async () => {
  globalThis.fetch = originalFetch
  await pg.close()
})

test('email-only signup normalizes, deduplicates atomically and creates no account', async () => {
  expect(subscribeInput.safeParse({ email: 'bad' }).success).toBe(false)
  const results = await Promise.all([
    subscribe(db, { email: ' Person@Example.test ' }),
    subscribe(db, { email: 'person@example.test' }),
  ])
  expect(results.map((x) => x.result).sort()).toEqual(['already', 'joined'])
  const rows = await db.select().from(schema.waitlistSubscriber)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    email: 'person@example.test',
    status: 'subscribed',
    consentVersion: 'waitlist-2026-09',
    syncPending: true,
  })
  const tables = await pg.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public'",
  )
  expect(tables.rows.map((x) => x.table_name)).toEqual(['waitlist_subscriber'])
})

test('honeypot returns quietly without storing or sending', async () => {
  expect(await subscribe(db, { email: 'bot@example.test', website: 'spam.test' })).toEqual({
    result: 'joined',
  })
  expect(await db.select().from(schema.waitlistSubscriber)).toHaveLength(0)
})

test('unsubscribe is signed, repeatable and cannot be reversed by signing up again', async () => {
  await subscribe(db, { email: 'person@example.test' })
  const [row] = await db.select().from(schema.waitlistSubscriber)
  const token = await unsubscribeToken(row.id, secret)
  expect(await verifyUnsubscribe(token, secret)).toBe(row.id)
  expect(await verifyUnsubscribe(token.slice(0, -8) + 'abcdefgh', secret)).toBeNull()
  expect(await verifyUnsubscribe(token, 'different-secret')).toBeNull()
  await expect(unsubscribe(db, token + 'x', secret)).rejects.toThrow('invalid')
  await unsubscribe(db, token, secret)
  await unsubscribe(db, token, secret)
  expect(await subscribe(db, { email: row.email })).toEqual({ result: 'unsubscribed' })
  const [updated] = await db.select().from(schema.waitlistSubscriber)
  expect(updated.status).toBe('unsubscribed')
  expect(updated.unsubscribedAt).toBeTruthy()
})

test('durable email job retries failure, then sends once with working unsubscribe', async () => {
  await subscribe(db, { email: 'person@example.test' })
  globalThis.fetch = async () => new Response('', { status: 503 })
  await processWaitlist(db, config)
  let [row] = await db.select().from(schema.waitlistSubscriber)
  expect(row).toMatchObject({ syncPending: true, syncAttempts: 1, welcomeSentAt: null })
  await db
    .update(schema.waitlistSubscriber)
    .set({ nextSyncAt: new Date(0) })
    .where(eq(schema.waitlistSubscriber.id, row.id))
  const messages: { text: string }[] = []
  globalThis.fetch = async (_url, options) => {
    messages.push(JSON.parse(String(options?.body)))
    return Response.json({ ok: true })
  }
  await processWaitlist(db, config)
  await processWaitlist(db, config)
  expect(messages).toHaveLength(1)
  const token = new URL(messages[0].text.match(/Unsubscribe: (.+)/)![1]).searchParams.get('token')!
  expect(await verifyUnsubscribe(token, secret)).toBe(row.id)
  ;[row] = await db.select().from(schema.waitlistSubscriber)
  expect(row.syncPending).toBe(false)
  expect(row.welcomeSentAt).toBeTruthy()
})

test('unsubscribe and complaints cancel queued welcome messages', async () => {
  await subscribe(db, { email: 'person@example.test' })
  await suppress(db, ['person@example.test'], 'suppressed')
  let sent = false
  globalThis.fetch = async () => {
    sent = true
    return Response.json({})
  }
  await processWaitlist(db, config)
  expect(sent).toBe(false)
  expect(await subscribe(db, { email: 'person@example.test' })).toEqual({ result: 'unsubscribed' })
})

test('existing Resend unsubscribe is honored and never reset', async () => {
  await subscribe(db, { email: 'person@example.test' })
  const calls: { method: string; url: string }[] = []
  globalThis.fetch = async (url, options) => {
    calls.push({ method: options?.method || 'GET', url: String(url) })
    return Response.json({ id: 'contact', unsubscribed: true })
  }
  await processWaitlist(db, {
    ...config,
    EMAIL_DELIVERY: 'resend',
    RESEND_API_KEY: 'test-only',
    RESEND_WAITLIST_SEGMENT_ID: 'test-segment',
  })
  expect(calls).toHaveLength(1)
  expect(calls[0].method).toBe('GET')
  expect((await db.select().from(schema.waitlistSubscriber))[0].status).toBe('unsubscribed')
})

test('webhook verifies published Svix vector; rejects tampering, stale and unsigned bodies', async () => {
  const body = '{"event_type":"ping","data":{"success":true}}'
  const headers = new Headers({
    'svix-id': 'msg_loFOjxBNrRLzqYUf',
    'svix-timestamp': '1731705121',
    'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  })
  const webhookSecret = 'whsec_plJ3nmyCDGBKInavdOK15jsl'
  expect(await verifyWebhook(body, headers, webhookSecret, 1731705121_000)).toBe(true)
  expect(await verifyWebhook(body + ' ', headers, webhookSecret, 1731705121_000)).toBe(false)
  expect(await verifyWebhook(body, headers, webhookSecret, 1731706000_000)).toBe(false)
  expect(await verifyWebhook(body, new Headers(), webhookSecret)).toBe(false)
  // An independent Node HMAC checks key handling and rotating-signature support.
  const now = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', Buffer.from(webhookSecret.slice(6), 'base64'))
    .update(`event.${now}.${body}`)
    .digest('base64')
  expect(
    await verifyWebhook(
      body,
      new Headers({
        'svix-id': 'event',
        'svix-timestamp': String(now),
        'svix-signature': `v1,AAAA v1,${signature}`,
      }),
      webhookSecret,
    ),
  ).toBe(true)
})

test('Resend sync uses a dedicated segment and idempotent welcome with one-click unsubscribe', async () => {
  await subscribe(db, { email: 'person@example.test' })
  const calls: {
    url: string
    method: string
    headers: Record<string, string>
    body: Record<string, unknown> | null
  }[] = []
  globalThis.fetch = async (url, options) => {
    calls.push({
      url: String(url),
      method: options?.method || 'GET',
      headers: options?.headers as Record<string, string>,
      body: options?.body ? JSON.parse(String(options.body)) : null,
    })
    return options?.method === 'GET'
      ? new Response(null, { status: 404 })
      : Response.json({ id: 'provider-id' })
  }
  await processWaitlist(db, {
    ...config,
    EMAIL_DELIVERY: 'resend',
    RESEND_API_KEY: 'test-only-send',
    RESEND_CONTACTS_API_KEY: 'test-only-contacts',
    EMAIL_FROM: 'Rekann <test@example.test>',
    RESEND_WAITLIST_SEGMENT_ID: 'waitlist-only',
  })
  expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST'])
  expect(calls[1].body).toEqual({
    email: 'person@example.test',
    segments: [{ id: 'waitlist-only' }],
  })
  expect(calls[1].headers.authorization).toBe('Bearer test-only-contacts')
  expect(calls[2].headers.authorization).toBe('Bearer test-only-send')
  expect(calls[2].headers['Idempotency-Key']).toMatch(/^waitlist-welcome\//)
  expect(calls[2].body?.headers).toMatchObject({
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
})

test('expired welcome job cannot duplicate a send after provider idempotency expires', async () => {
  await subscribe(db, { email: 'person@example.test' })
  await db
    .update(schema.waitlistSubscriber)
    .set({ createdAt: new Date(Date.now() - 24 * 3600_000) })
  let sent = false
  globalThis.fetch = async () => {
    sent = true
    return Response.json({})
  }
  await processWaitlist(db, config)
  expect(sent).toBe(false)
  expect((await db.select().from(schema.waitlistSubscriber))[0].syncPending).toBe(false)
})
