import { test, expect } from '@playwright/test'
import {
  client,
  company,
  details,
  invite,
  otp,
  password,
  post,
  profile,
  register,
  uniqueEmail,
  verified,
} from './helpers'
test('verification, reset, enumeration responses, password policy, and session revocation', async () => {
  const ctx = await client()
  const email = uniqueEmail('auth')
  expect(
    (
      await ctx.post('/api/auth/sign-up/email', {
        data: { email, name: 'Test', password: 'short' },
      })
    ).status(),
  ).toBe(400)
  await register(ctx, email)
  expect((await ctx.get('/api/app/bootstrap')).status()).toBe(401)
  expect((await ctx.post('/api/auth/sign-in/email', { data: { email, password } })).status()).toBe(
    403,
  )
  expect(
    (
      await ctx.post('/api/auth/email-otp/verify-email', { data: { email, otp: 'wrong' } })
    ).status(),
  ).toBeGreaterThanOrEqual(400)
  const code = await otp(email)
  expect(
    (await ctx.post('/api/auth/email-otp/verify-email', { data: { email, otp: code } })).status(),
  ).toBe(200)
  expect((await ctx.get('/api/app/bootstrap')).status()).toBe(200)
  const cookies = (await ctx.storageState()).cookies
  expect(cookies.some((c) => c.httpOnly && c.sameSite === 'Lax')).toBe(true)
  expect(
    (await ctx.post('/api/auth/email-otp/verify-email', { data: { email, otp: code } })).status(),
  ).toBeGreaterThanOrEqual(400)
  const second = await client()
  expect(
    (await second.post('/api/auth/sign-in/email', { data: { email, password } })).status(),
  ).toBe(200)
  expect(
    (await second.post('/api/auth/email-otp/request-password-reset', { data: { email } })).status(),
  ).toBe(200)
  const resetCode = await otp(email)
  expect(
    (
      await second.post('/api/auth/email-otp/reset-password', {
        data: { email, otp: resetCode, password: `${password} changed` },
      })
    ).status(),
  ).toBe(200)
  expect((await ctx.get('/api/app/bootstrap')).status()).toBe(401)
  expect((await second.get('/api/app/bootstrap')).status()).toBe(401)
  expect(
    (await second.post('/api/auth/sign-in/email', { data: { email, password } })).status(),
  ).toBe(401)
  expect(
    (
      await second.post('/api/auth/sign-in/email', {
        data: { email, password: `${password} changed` },
      })
    ).status(),
  ).toBe(200)
  expect((await second.post('/api/auth/sign-out', { data: {} })).status()).toBe(200)
  expect((await second.get('/api/app/bootstrap')).status()).toBe(401)
  expect(
    (
      await second.post('/api/auth/email-otp/request-password-reset', {
        data: { email: uniqueEmail('unknown') },
      })
    ).status(),
  ).toBe(200)
  await ctx.dispose()
  await second.dispose()
})

test('workspace isolation, invitations, manager permissions, concurrency, and immediate revocation', async () => {
  test.setTimeout(240_000)
  const admin = await client()
  const employee = await client()
  const stranger = await client()
  const adminEmail = uniqueEmail('admin'),
    employeeEmail = uniqueEmail('employee'),
    strangerEmail = uniqueEmail('stranger')
  await verified(admin, adminEmail)
  await verified(employee, employeeEmail)
  await verified(stranger, strangerEmail)
  const workspaceId = await company(admin, 'E2E Main ' + crypto.randomUUID().slice(0, 8))
  const otherId = await company(stranger, 'E2E Other ' + crypto.randomUUID().slice(0, 8))
  await profile(admin, workspaceId)
  await profile(stranger, otherId)
  const companyUpdate = {
    workspaceId,
    name: 'Changed company',
    description: 'Updated details',
    country: 'Indonesia',
    industry: 'Technology',
    timeZone: 'Asia/Jakarta',
  }
  await post(admin, 'workspace/onboarding-update', companyUpdate, 403)
  await post(stranger, 'workspace/onboarding-update', companyUpdate, 403)
  expect((await employee.get(`/api/app/workspace?id=${workspaceId}`)).status()).toBe(403)
  expect((await admin.get(`/api/app/workspace?id=${otherId}`)).status()).toBe(403)
  const token = await invite(admin, workspaceId, employeeEmail)
  await post(stranger, 'invitation/accept', { token }, 403)
  const accepted = await Promise.all([
    post(employee, 'invitation/accept', { token }),
    post(employee, 'invitation/accept', { token }),
  ])
  expect(accepted.every((a) => a.workspaceId === workspaceId)).toBe(true)
  await post(employee, 'workspace/onboarding-update', companyUpdate, 403)
  await profile(employee, workspaceId, 'Taylor')
  let main = await details(admin, workspaceId)
  expect(main.employees).toHaveLength(2)
  const adminId = main.employee.id,
    employeeId = main.employees.find((e: { email: string }) => e.email === employeeEmail).id
  await post(
    employee,
    'access/save',
    { workspaceId, managersEnabled: true, managerPermissions: [] },
    403,
  )
  await post(employee, 'employee/role', { workspaceId, employeeId, role: 'admin' }, 403)
  await post(
    employee,
    'invitation/create',
    { workspaceId, email: uniqueEmail('denied'), role: 'employee' },
    403,
  )
  await post(
    employee,
    'profile/save',
    {
      workspaceId,
      firstName: 'Tampered',
      lastName: 'Person',
      jobTitle: 'Designer',
      phone: '',
      birthDate: '',
      birthPlace: '',
      role: 'admin',
    },
    400,
  )
  await post(
    admin,
    'employee/remove',
    { workspaceId, employeeId: (await details(stranger, otherId)).employee.id },
    404,
  )
  await post(admin, 'employee/remove', { workspaceId, employeeId: adminId }, 409)
  await post(admin, 'employee/role', { workspaceId, employeeId: adminId, role: 'employee' }, 409)
  await post(admin, 'access/save', {
    workspaceId,
    managersEnabled: true,
    managerPermissions: ['invite_employees'],
  })
  await post(admin, 'employee/role', { workspaceId, employeeId, role: 'manager' })
  expect((await details(employee, workspaceId)).permissions.invite).toBe(true)
  await post(
    employee,
    'invitation/create',
    { workspaceId, email: uniqueEmail('escalation'), role: 'admin' },
    403,
  )
  await post(employee, 'employee/remove', { workspaceId, employeeId: adminId }, 403)
  const pendingEmail = uniqueEmail('pending')
  const oldToken = await invite(employee, workspaceId, pendingEmail)
  const newToken = await invite(employee, workspaceId, pendingEmail)
  expect(newToken).not.toBe(oldToken)
  expect((await employee.get(`/api/app/invitation?token=${oldToken}`)).status()).toBe(410)
  await post(admin, 'access/save', { workspaceId, managersEnabled: false, managerPermissions: [] })
  expect((await details(employee, workspaceId)).employee.role).toBe('employee')
  await post(
    employee,
    'invitation/create',
    { workspaceId, email: uniqueEmail('disabled'), role: 'employee' },
    403,
  )
  main = await details(admin, workspaceId)
  const pending = main.invitations.find((i: { email: string }) => i.email === pendingEmail)
  await post(admin, 'invitation/revoke', { workspaceId, invitationId: pending.id })
  expect((await employee.get(`/api/app/invitation?token=${newToken}`)).status()).toBe(410)
  const personalWorkspaceId = await company(
    employee,
    'E2E Personal ' + crypto.randomUUID().slice(0, 8),
  )
  await post(admin, 'employee/remove', { workspaceId, employeeId })
  expect((await employee.get(`/api/app/workspace?id=${workspaceId}`)).status()).toBe(403)
  expect((await employee.get(`/api/app/workspace?id=${personalWorkspaceId}`)).status()).toBe(200)
  await post(employee, 'invitation/accept', { token }, 410)
  const csrf = await admin.post('/api/app/access/save', {
    headers: { origin: 'https://evil.example' },
    data: { workspaceId, managersEnabled: true, managerPermissions: [] },
  })
  expect(csrf.status()).toBe(403)
  await admin.dispose()
  await employee.dispose()
  await stranger.dispose()
})

test('auth endpoints enforce rate limits and reject unused authentication methods', async () => {
  const ctx = await client()
  for (const path of [
    'sign-in/email-otp',
    'email-otp/get-verification-otp',
    'email-otp/create-verification-otp',
    'update-user',
    'sign-in/social',
  ]) {
    expect((await ctx.post(`/api/auth/${path}`, { data: {} })).status()).toBe(404)
  }
  expect(
    (
      await ctx.post('/api/auth/email-otp/send-verification-otp', {
        data: { email: uniqueEmail('otp'), type: 'sign-in' },
      })
    ).status(),
  ).toBe(400)
  const responses = []
  for (let i = 0; i < 6; i++)
    responses.push(
      await ctx.post('/api/auth/sign-in/email', { data: { email: uniqueEmail('rate'), password } }),
    )
  expect(responses.at(-1)!.status()).toBe(429)
  await ctx.dispose()
})
