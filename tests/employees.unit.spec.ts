import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import { employeeDetails, saveEmployee, nextEmployeeNumber } from '../src/server/employees'
import { setEmployeeActive, getEmployeeDetail } from '../src/server/employee-detail'
import { createInvitation, acceptInvitation } from '../src/server/workspaces'
import { readConfig } from '../src/server/config'
import { emptyEmployee } from '../src/shared/employee-input'
import { saveMedia, readMedia } from '../src/server/media'
import { directoryEmployees } from '../src/server/directory'

const config = readConfig({
  DATABASE_URL: 'postgres://unused',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4310',
  APP_ENV: 'local',
  EMAIL_DELIVERY: 'local',
})
test('employee draft, validation, invitation retry and acceptance preserve one scoped record', async () => {
  const pg = new PGlite()
  const originalFetch = globalThis.fetch
  let deliveryFails = false
  globalThis.fetch = async (url) => {
    expect(String(url)).toBe('http://127.0.0.1:8025/messages')
    return new Response('', { status: deliveryFails ? 503 : 200 })
  }
  try {
    for (const file of [
      '0000_thankful_groot',
      '0001_workspace_slug',
      '0003_require_workspace_slug',
      '0006_cuddly_stature',
      '0007_red_ser_duncan',
      '0009_open_junta',
    ])
      await pg.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'))
    const db = drizzle(pg, { schema }) as unknown as Database
    const owner = { id: 'owner', email: 'owner@example.test', name: 'Owner', emailVerified: true }
    const joiner = { id: 'joiner', email: 'emily@example.test', name: 'Emily', emailVerified: true }
    await db
      .insert(schema.user)
      .values([
        owner,
        joiner,
        { id: 'employee', name: 'Employee', email: 'employee@example.test' },
        { id: 'outsider', name: 'Outsider', email: 'outsider@example.test' },
      ])
    const workspaceId = crypto.randomUUID()
    const otherWorkspaceId = crypto.randomUUID()
    await db.insert(schema.workspace).values(
      [workspaceId, otherWorkspaceId].map((id) => ({
        id,
        slug: id,
        name: 'Test team',
        createdBy: 'owner',
        country: 'Indonesia',
        industry: 'Technology',
        timeZone: 'Asia/Jakarta',
      })),
    )
    await db.insert(schema.workspaceMember).values([
      { id: 'owner-member', workspaceId, userId: 'owner', role: 'admin' },
      { id: 'employee-member', workspaceId, userId: 'employee' },
      { id: 'outsider-member', workspaceId: otherWorkspaceId, userId: 'outsider', role: 'admin' },
    ])
    const body = {
      id: crypto.randomUUID(),
      workspaceId,
      version: 0,
      status: 'draft' as const,
      fields: {
        ...emptyEmployee,
        fullName: 'Emily Louris',
        email: ' EMILY@example.test ',
        employeeNumber: 'EMP1001',
        department: 'Design',
        jobTitle: 'UX Designer',
        employmentType: 'Full-time' as const,
        phone: '+6281234567',
        nationalId: 'private-id',
        address: 'Private address',
      },
    }
    await expect(saveEmployee(db, 'employee', body)).rejects.toMatchObject({ status: 403 })
    const first = await saveEmployee(db, 'owner', body)
    expect(first.version).toBe(1)
    expect(await saveEmployee(db, 'owner', body)).toEqual(first)
    await expect(employeeDetails(db, 'outsider', workspaceId, body.id)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      saveEmployee(db, 'outsider', { ...body, workspaceId: otherWorkspaceId }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      saveEmployee(db, 'owner', { ...body, fields: { ...body.fields, fullName: 'Changed' } }),
    ).rejects.toMatchObject({ status: 409 })
    const keys = new Map<string, Uint8Array>()
    const bucket = {
      put: async (key: string, bytes: Uint8Array) => {
        keys.set(key, bytes)
      },
      delete: async (key: string) => {
        keys.delete(key)
      },
      get: async (key: string) =>
        keys.has(key) ? { body: keys.get(key), httpMetadata: { contentType: 'image/png' } } : null,
    } as unknown as R2Bucket
    const image =
      'data:image/png;base64,' +
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64')
    const photo = { workspaceId, kind: 'avatar', employeeRecordId: body.id, data: image }
    await expect(saveMedia(db, bucket, 'employee', photo)).rejects.toMatchObject({ status: 403 })
    const uploaded = await saveMedia(db, bucket, 'owner', photo)
    expect(keys.size).toBe(1)
    await expect(readMedia(db, bucket, 'employee', uploaded.key!)).rejects.toMatchObject({
      status: 404,
    })
    const [ownerAfterPhoto] = await db
      .select()
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.id, 'owner-member'))
    expect(ownerAfterPhoto.avatarKey).toBeNull()
    await saveMedia(db, bucket, 'owner', { ...photo, data: '' })
    expect(keys.size).toBe(0)
    expect((await employeeDetails(db, 'owner', workspaceId, body.id)).avatarKey).toBeNull()
    await createInvitation(db, config, owner, {
      workspaceId,
      email: 'pending@example.test',
      role: 'employee',
    })
    await expect(
      saveEmployee(db, 'owner', {
        ...body,
        id: crypto.randomUUID(),
        fields: { ...body.fields, email: 'pending@example.test', employeeNumber: 'EMP1002' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    const invite = { workspaceId, email: joiner.email, role: 'employee' }
    await expect(createInvitation(db, config, owner, invite)).rejects.toMatchObject({ status: 400 })
    await expect(
      saveEmployee(db, 'owner', {
        ...body,
        id: crypto.randomUUID(),
        fields: { ...body.fields, employeeNumber: 'EMP1002' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      saveEmployee(db, 'owner', {
        ...body,
        id: crypto.randomUUID(),
        fields: { ...body.fields, email: 'another@example.test', employeeNumber: 'emp1001' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      saveEmployee(db, 'owner', {
        ...body,
        version: 1,
        fields: { ...body.fields, role: 'manager' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect((await nextEmployeeNumber(db, 'owner', workspaceId)).employeeNumber).toBe('EMP1002')
    const rows = await directoryEmployees(db, 'owner', workspaceId)
    expect(rows.find((r) => r.id === body.id)).toMatchObject({
      recordStatus: 'draft',
      email: joiner.email,
    })
    expect(rows.find((r) => r.id === body.id)).not.toHaveProperty('nationalId')
    expect(
      (await directoryEmployees(db, 'employee', workspaceId)).some((r) => r.id === body.id),
    ).toBe(false)
    await saveEmployee(db, 'owner', {
      ...body,
      version: 1,
      status: 'ready',
      fields: { ...body.fields, startDate: '2026-09-01', reportingManagerId: 'owner-member' },
    })
    deliveryFails = true
    await expect(createInvitation(db, config, owner, invite)).rejects.toMatchObject({ status: 502 })
    expect((await employeeDetails(db, 'owner', workspaceId, body.id)).invite?.delivery).toBe(
      'failed',
    )
    deliveryFails = false
    const firstInvite = await createInvitation(db, config, owner, invite)
    const renewed = await createInvitation(db, config, owner, invite)
    const token = renewed.inviteUrl.split('/').at(-1)!
    await expect(
      acceptInvitation(db, joiner, { token: firstInvite.inviteUrl.split('/').at(-1) }),
    ).rejects.toMatchObject({ status: 410 })
    await expect(acceptInvitation(db, owner, { token })).rejects.toMatchObject({ status: 403 })
    const result = await acceptInvitation(db, joiner, { token })
    expect(result.workspaceId).toBe(workspaceId)
    expect(await acceptInvitation(db, joiner, { token })).toEqual(result)
    const [member] = await db
      .select()
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.userId, 'joiner'))
    expect(member).toMatchObject({
      id: body.id,
      firstName: 'Emily',
      lastName: 'Louris',
      employeeNumber: 'EMP1001',
      department: 'Design',
      startDate: '2026-09-01',
      role: 'employee',
    })
    const acceptedRows = await directoryEmployees(db, 'owner', workspaceId)
    expect(acceptedRows.filter((r) => r.email === joiner.email)).toHaveLength(1)
    expect(acceptedRows.find((r) => r.email === joiner.email)?.recordId).toBe(body.id)
    const saved = await employeeDetails(db, 'owner', workspaceId, body.id)
    expect(saved.fields.nationalId).toBe('private-id')
    expect(saved.memberId).toBe(member.id)
    await expect(saveEmployee(db, 'owner', { ...body, version: 2 })).rejects.toMatchObject({
      status: 409,
    })
    await setEmployeeActive(db, 'owner', { workspaceId, id: body.id, active: false })
    await expect(createInvitation(db, config, owner, invite)).rejects.toMatchObject({ status: 409 })
    await setEmployeeActive(db, 'owner', { workspaceId, id: body.id, active: true })
    expect((await getEmployeeDetail(db, 'owner', workspaceId, body.id)).accountActive).toBe(false)
    const reInvite = await createInvitation(db, config, owner, invite)
    await acceptInvitation(db, joiner, { token: reInvite.inviteUrl.split('/').at(-1)! })
    const restored = await getEmployeeDetail(db, 'owner', workspaceId, body.id)
    expect(restored.accountActive).toBe(true)
    expect(restored.fields.nationalId).toBe('private-id')
    expect(
      (await directoryEmployees(db, 'owner', workspaceId)).filter((r) => r.email === joiner.email),
    ).toHaveLength(1)
  } finally {
    globalThis.fetch = originalFetch
    await pg.close()
  }
})
