import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { neon } from '@neondatabase/serverless'
import { client, company, details, invite, post, uniqueEmail, verified } from './helpers'

test('private images, invalid uploads, expired invitations, and concurrent last-admin changes', async () => {
  test.setTimeout(180_000)
  const config = parseEnv(readFileSync('.dev.vars', 'utf8'))
  // Never manipulate expiry fixtures in a production application environment.
  expect(config.APP_ENV).toBe('local')
  expect(new URL(config.BETTER_AUTH_URL).hostname).toBe('127.0.0.1')
  const sql = neon(config.DATABASE_URL)
  const first = await client(),
    second = await client(),
    outsider = await client(),
    anonymous = await client()
  const firstEmail = uniqueEmail('firstadmin'),
    secondEmail = uniqueEmail('secondadmin')
  await verified(first, firstEmail)
  await verified(second, secondEmail)
  await verified(outsider, uniqueEmail('outside'))
  const workspaceId = await company(first, 'Boundary test ' + crypto.randomUUID().slice(0, 8))
  const token = await invite(first, workspaceId, secondEmail, 'admin')
  await post(second, 'invitation/accept', { token })
  const image =
    'data:image/png;base64,' + readFileSync('public/images/auth-strip.png').toString('base64')
  const { key } = await post(first, 'media', { workspaceId, kind: 'logo', data: image })
  const media = await second.get(`/api/app/media?key=${encodeURIComponent(key)}`)
  expect(media.status()).toBe(200)
  expect(media.headers()['cache-control']).toContain('no-store')
  expect((await outsider.get(`/api/app/media?key=${encodeURIComponent(key)}`)).status()).toBe(403)
  expect((await anonymous.get(`/api/app/media?key=${encodeURIComponent(key)}`)).status()).toBe(401)
  await post(
    first,
    'media',
    { workspaceId, kind: 'logo', data: 'data:image/svg+xml;base64,PHN2Zz4=' },
    400,
  )
  const expiredEmail = uniqueEmail('expired')
  const expiredToken = await invite(first, workspaceId, expiredEmail)
  await sql`update workspace_invitation set expires_at = now() - interval '1 minute' where workspace_id = ${workspaceId} and email = ${expiredEmail}`
  expect((await first.get(`/api/app/invitation?token=${expiredToken}`)).status()).toBe(410)
  const firstId = (await details(first, workspaceId)).employee.id
  const secondId = (await details(second, workspaceId)).employee.id
  const responses = await Promise.all([
    first.post('/api/app/employee/role', {
      data: { workspaceId, employeeId: firstId, role: 'employee' },
    }),
    second.post('/api/app/employee/role', {
      data: { workspaceId, employeeId: secondId, role: 'employee' },
    }),
  ])
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409])
  const remaining = await details(first, workspaceId)
  expect(remaining.employees.filter((e: { role: string }) => e.role === 'admin')).toHaveLength(1)
  const admin = remaining.employee.role === 'admin' ? first : second
  const removed = admin === first ? second : first
  await post(admin, 'employee/remove', {
    workspaceId,
    employeeId: admin === first ? secondId : firstId,
  })
  expect((await removed.get(`/api/app/media?key=${encodeURIComponent(key)}`)).status()).toBe(403)
  await Promise.all([first.dispose(), second.dispose(), outsider.dispose(), anonymous.dispose()])
})
