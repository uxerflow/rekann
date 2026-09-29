import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import {
  getEmployeeDetail,
  patchEmployeeDetail,
  setEmployeeActive,
} from '../src/server/employee-detail'
import {
  employeeTime,
  saveEmployeeAllowance,
  recordEmployeeLeave,
  reviewEmployeeLeave,
  clockEmployee,
} from '../src/server/employee-time'
import {
  employeeDocuments,
  saveEmployeeDocument,
  readEmployeeDocument,
  deleteEmployeeDocument,
} from '../src/server/employee-documents'
import { emptyEmployee } from '../src/shared/employee-input'
import { directoryEmployees } from '../src/server/directory'

async function setup() {
  const pg = new PGlite()
  for (const file of [
    '0000_thankful_groot',
    '0001_workspace_slug',
    '0003_require_workspace_slug',
    '0006_cuddly_stature',
    '0007_red_ser_duncan',
    '0009_open_junta',
    '0014_curved_zodiak',
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'))
  const db = drizzle(pg, { schema }) as unknown as Database
  await db.insert(schema.user).values(
    ['admin', 'manager', 'employee', 'peer', 'outsider'].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: id,
    })),
  )
  await db.insert(schema.workspace).values(
    ['one', 'two'].map((id) => ({
      id,
      slug: id,
      name: id,
      createdBy: 'admin',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Asia/Jakarta',
      managersEnabled: true,
    })),
  )
  await db.insert(schema.workspaceMember).values(
    ['admin', 'manager', 'employee', 'peer', 'outsider'].map((id) => ({
      id: `member-${id}`,
      userId: id,
      workspaceId: id === 'outsider' ? 'two' : 'one',
      role:
        id === 'admin' || id === 'outsider'
          ? ('admin' as const)
          : id === 'manager'
            ? ('manager' as const)
            : ('employee' as const),
      firstName: id,
      profileCompleted: true,
    })),
  )
  await db.insert(schema.employeeRecord).values({
    id: crypto.randomUUID(),
    workspaceId: 'one',
    createdBy: 'admin',
    memberId: 'member-employee',
    email: 'employee@example.test',
    employeeNumber: 'EMP1',
    status: 'ready',
    fields: {
      ...emptyEmployee,
      fullName: 'employee',
      email: 'employee@example.test',
      employeeNumber: 'EMP1',
      nationalId: 'SECRET-ID',
      reportingManagerId: 'member-manager',
    },
  })
  return { pg, db }
}
test('detail edits protect private fields, scope, account identity, stale writes and reactivation', async () => {
  const { pg, db } = await setup()
  try {
    const scope = { workspaceId: 'one', id: 'member-employee' }
    const d = await getEmployeeDetail(db, 'admin', scope.workspaceId, scope.id)
    expect(d.fields.nationalId).toBe('SECRET-ID')
    expect((await getEmployeeDetail(db, 'peer', 'one', scope.id)).fields.nationalId).toBe('')
    expect((await getEmployeeDetail(db, 'manager', 'one', scope.id)).permissions.edit).toBe(true)
    await expect(getEmployeeDetail(db, 'outsider', 'one', scope.id)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      patchEmployeeDetail(db, 'employee', {
        ...scope,
        version: d.version,
        section: 'identification',
        fields: { nationalId: 'stolen' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      patchEmployeeDetail(db, 'admin', {
        ...scope,
        version: d.version,
        section: 'profile',
        fields: { email: 'new@example.test' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      patchEmployeeDetail(db, 'employee', {
        ...scope,
        version: d.version,
        section: 'profile',
        fields: { jobTitle: 'CEO' },
      }),
    ).rejects.toMatchObject({ status: 400 })
    await patchEmployeeDetail(db, 'admin', {
      ...scope,
      version: d.version,
      section: 'emergency',
      fields: {
        emergencyName: 'Contact',
        emergencyPhone: '+62812345',
        emergencyRelationship: 'Spouse',
      },
      additionalContact: { name: 'Parent', phone: '+62823456', relationship: 'Parent' },
    })
    const edited = await getEmployeeDetail(db, 'admin', 'one', scope.id)
    expect(edited.additionalContact?.name).toBe('Parent')
    await expect(
      patchEmployeeDetail(db, 'admin', {
        ...scope,
        version: d.version,
        section: 'personal',
        fields: { nationality: 'Indonesia' },
      }),
    ).rejects.toMatchObject({ status: 409 })
    await patchEmployeeDetail(db, 'admin', {
      ...scope,
      version: edited.version,
      section: 'work',
      fields: {
        employeeNumber: 'EMP1',
        jobTitle: 'Designer',
        department: 'Design',
        startDate: '2026-01-01',
      },
    })
    expect(
      (await directoryEmployees(db, 'admin', 'one')).find((r) => r.id === scope.id)?.jobTitle,
    ).toBe('Designer')
    await expect(
      setEmployeeActive(db, 'manager', { ...scope, active: false }),
    ).rejects.toMatchObject({ status: 403 })
    await setEmployeeActive(db, 'admin', { ...scope, active: false })
    await expect(getEmployeeDetail(db, 'employee', 'one', scope.id)).rejects.toMatchObject({
      status: 403,
    })
    expect(
      (await directoryEmployees(db, 'admin', 'one', true)).find((r) => r.id === scope.id)?.status,
    ).toBe('removed')
    await setEmployeeActive(db, 'admin', { ...scope, active: true })
    const reactivated = await getEmployeeDetail(db, 'admin', 'one', scope.id)
    expect(reactivated.inactive).toBe(false)
    expect(reactivated.accountActive).toBe(false)
    expect(reactivated.fields.nationalId).toBe('SECRET-ID')
  } finally {
    await pg.close()
  }
})
test('leave approvals, overlap, self-review, allowance and cancellation remain consistent', async () => {
  const { pg, db } = await setup()
  try {
    const scope = { workspaceId: 'one', id: 'member-employee' }
    const leave = {
      ...scope,
      requestId: crypto.randomUUID(),
      type: 'Annual leave',
      startDate: '2026-09-28',
      endDate: '2026-09-29',
      duration: 'Full day',
      reason: 'Family appointment',
    }
    await expect(recordEmployeeLeave(db, 'employee', leave)).rejects.toMatchObject({ status: 409 })
    await expect(
      saveEmployeeAllowance(db, 'manager', {
        ...scope,
        year: 2026,
        type: 'Annual leave',
        days: 12,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await saveEmployeeAllowance(db, 'admin', {
      ...scope,
      year: 2026,
      type: 'Annual leave',
      days: 12,
    })
    await recordEmployeeLeave(db, 'employee', leave)
    await recordEmployeeLeave(db, 'employee', leave)
    await expect(
      recordEmployeeLeave(db, 'employee', { ...leave, requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      reviewEmployeeLeave(db, 'employee', {
        ...scope,
        requestId: leave.requestId,
        action: 'approve',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await reviewEmployeeLeave(db, 'manager', {
      ...scope,
      requestId: leave.requestId,
      action: 'approve',
    })
    await reviewEmployeeLeave(db, 'manager', {
      ...scope,
      requestId: leave.requestId,
      action: 'approve',
    })
    let time = await employeeTime(db, 'employee', 'one', scope.id, '2026-09')
    expect(time.leaves).toHaveLength(1)
    expect(time.allowances[0].usedHalfDays).toBe(4)
    await expect(
      reviewEmployeeLeave(db, 'manager', {
        ...scope,
        requestId: leave.requestId,
        action: 'reject',
        reason: 'Changed mind',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await reviewEmployeeLeave(db, 'employee', {
      ...scope,
      requestId: leave.requestId,
      action: 'cancel',
    })
    time = await employeeTime(db, 'employee', 'one', scope.id, '2026-09')
    expect(time.allowances[0].usedHalfDays).toBe(0)
    const second = { ...leave, requestId: crypto.randomUUID() }
    await recordEmployeeLeave(db, 'employee', second)
    await expect(
      reviewEmployeeLeave(db, 'manager', {
        ...scope,
        requestId: second.requestId,
        action: 'reject',
        reason: '',
      }),
    ).rejects.toMatchObject({ status: 400 })
    await reviewEmployeeLeave(db, 'manager', {
      ...scope,
      requestId: second.requestId,
      action: 'reject',
      reason: 'Schedule conflict',
    })
    expect(
      (await employeeTime(db, 'employee', 'one', scope.id, '2026-09')).leaves.find(
        (r) => r.id === second.requestId,
      )?.rejectionReason,
    ).toBe('Schedule conflict')
    await expect(employeeTime(db, 'peer', 'one', scope.id, '2026-09')).rejects.toMatchObject({
      status: 403,
    })
    const attendance = { ...scope, attendanceId: crypto.randomUUID(), action: 'in' }
    await clockEmployee(db, 'employee', attendance)
    await clockEmployee(db, 'employee', attendance)
    await expect(
      clockEmployee(db, 'employee', { ...attendance, attendanceId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      clockEmployee(db, 'manager', { ...attendance, action: 'out' }),
    ).rejects.toMatchObject({ status: 403 })
    await clockEmployee(db, 'employee', { ...attendance, action: 'out' })
    expect(await db.select().from(schema.employeeAttendance)).toHaveLength(1)
  } finally {
    await pg.close()
  }
})
test('private documents validate content and permissions and support reversible deletion', async () => {
  const { pg, db } = await setup()
  const objects = new Map<string, Uint8Array>()
  const bucket = {
    put: async (k: string, b: Uint8Array) => {
      objects.set(k, b)
    },
    get: async (k: string) => (objects.has(k) ? { body: objects.get(k) } : null),
    delete: async (k: string) => {
      objects.delete(k)
    },
  } as unknown as R2Bucket
  try {
    const scope = { workspaceId: 'one', id: 'member-employee' }
    const doc = {
      ...scope,
      documentId: crypto.randomUUID(),
      version: 0,
      title: 'Private agreement',
      category: 'Employment agreements',
      visibleToEmployee: false,
    }
    const file = new File(['%PDF-1.7\nDocument fixture\n%%EOF'], 'contract.pdf', {
      type: 'application/pdf',
    })
    await expect(saveEmployeeDocument(db, bucket, 'peer', doc, file)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      saveEmployeeDocument(
        db,
        bucket,
        'admin',
        doc,
        new File(['<html>not a document</html>'], 'evil.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    await saveEmployeeDocument(db, bucket, 'admin', doc, file)
    expect(await employeeDocuments(db, 'employee', 'one', scope.id)).toHaveLength(0)
    await expect(
      readEmployeeDocument(db, bucket, 'employee', 'one', scope.id, doc.documentId, false),
    ).rejects.toMatchObject({ status: 404 })
    await saveEmployeeDocument(db, bucket, 'admin', { ...doc, version: 1, visibleToEmployee: true })
    expect(await employeeDocuments(db, 'employee', 'one', scope.id)).toHaveLength(1)
    const response = await readEmployeeDocument(
      db,
      bucket,
      'employee',
      'one',
      scope.id,
      doc.documentId,
      true,
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toContain('%PDF-')
    await deleteEmployeeDocument(db, 'admin', { ...scope, documentId: doc.documentId })
    await expect(
      readEmployeeDocument(db, bucket, 'employee', 'one', scope.id, doc.documentId, false),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      deleteEmployeeDocument(db, 'manager', {
        ...scope,
        documentId: doc.documentId,
        restore: true,
      }),
    ).rejects.toMatchObject({ status: 410 })
    await deleteEmployeeDocument(db, 'admin', {
      ...scope,
      documentId: doc.documentId,
      restore: true,
    })
    expect(await employeeDocuments(db, 'employee', 'one', scope.id)).toHaveLength(1)
    await expect(
      saveEmployeeDocument(db, bucket, 'admin', {
        ...doc,
        documentId: crypto.randomUUID(),
        url: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ status: 400 })
    await setEmployeeActive(db, 'admin', { ...scope, active: false })
    await expect(
      readEmployeeDocument(db, bucket, 'employee', 'one', scope.id, doc.documentId, false),
    ).rejects.toMatchObject({ status: 403 })
  } finally {
    await pg.close()
  }
})

test('profile and photo save atomically, preserving previous data when storage fails', async () => {
  const { pg, db } = await setup()
  const objects = new Map<string, Uint8Array>()
  const bucket = {
    put: async (key: string, data: Uint8Array) => {
      objects.set(key, data)
    },
    delete: async (key: string) => {
      objects.delete(key)
    },
  } as unknown as R2Bucket
  try {
    const scope = { workspaceId: 'one', id: 'member-employee' }
    const detail = await getEmployeeDetail(db, 'admin', 'one', scope.id)
    const photo =
      'data:image/png;base64,' +
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64')
    const patch = {
      ...scope,
      version: detail.version,
      section: 'profile',
      fields: { fullName: 'Updated Employee' },
      photo,
    }
    await expect(patchEmployeeDetail(db, 'peer', patch, bucket)).rejects.toMatchObject({
      status: 403,
    })
    expect(objects.size).toBe(0)
    await expect(
      patchEmployeeDetail(db, 'admin', patch, {
        put: async () => {
          throw new Error('Storage unavailable')
        },
        delete: async () => {},
      } as unknown as R2Bucket),
    ).rejects.toThrow('Storage unavailable')
    expect((await getEmployeeDetail(db, 'admin', 'one', scope.id)).fields.fullName).toBe(
      detail.fields.fullName,
    )
    await patchEmployeeDetail(db, 'admin', patch, bucket)
    const saved = await getEmployeeDetail(db, 'admin', 'one', scope.id)
    expect(saved.fields.fullName).toBe('Updated Employee')
    expect(objects.has(saved.avatarKey!)).toBe(true)
    await expect(patchEmployeeDetail(db, 'admin', patch, bucket)).rejects.toMatchObject({
      status: 409,
    })
    expect(objects.size).toBe(1)
    await patchEmployeeDetail(db, 'admin', { ...patch, version: saved.version, photo: '' }, bucket)
    expect((await getEmployeeDetail(db, 'admin', 'one', scope.id)).avatarKey).toBeNull()
    expect(objects.size).toBe(0)
  } finally {
    await pg.close()
  }
})
