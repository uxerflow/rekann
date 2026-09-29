import { and, eq } from 'drizzle-orm'
import type { Database } from './db'
import { workspace, workspaceMember, employeeRecord } from './schema'
import { AppError, authorize, canManage } from './workspaces'
import { mediaInput } from '../shared/contracts'

export async function saveMedia(db: Database, bucket: R2Bucket, userId: string, input: unknown) {
  const { workspaceId, kind, data, employeeRecordId } = mediaInput.parse(input)
  const removing = !!employeeRecordId && data === ''
  // The browser downsizes images. Accept only bounded PNG/JPEG bytes, never SVG/HTML.
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data)
  if (!match && !removing) throw new AppError(400, 'Choose a PNG or JPEG image.')
  const bytes = Uint8Array.from(atob(match?.[2] ?? ''), (char) => char.charCodeAt(0))
  if (!removing && (bytes.length > 250_000 || bytes.length < 16))
    throw new AppError(400, 'Choose an image smaller than 250 KB after resizing.')
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if ((match?.[1] === 'png' && !isPng) || (match?.[1] === 'jpeg' && !isJpeg))
    throw new AppError(400, 'This image format is not supported.')
  const key = `${workspaceId}/${crypto.randomUUID()}.${match?.[1] ?? 'png'}`
  let oldKey: string | null = null
  try {
    await db.transaction(async (tx) => {
      const { company, employee } = await authorize(tx, userId, workspaceId, true)
      if (kind === 'logo' && employee.role !== 'admin')
        throw new AppError(403, 'Only an admin can change the company logo.')
      const [record] = employeeRecordId
        ? await tx
            .select()
            .from(employeeRecord)
            .where(
              and(
                eq(employeeRecord.workspaceId, workspaceId),
                eq(employeeRecord.id, employeeRecordId),
              ),
            )
        : []
      if (
        employeeRecordId &&
        (!record ||
          kind !== 'avatar' ||
          record.memberId ||
          record.invitationId ||
          !canManage(employee.role, company, 'invite_employees') ||
          (employee.role !== 'admin' && record.createdBy !== userId))
      )
        throw new AppError(403, 'You cannot change this employee photo.')
      if (!removing)
        await bucket.put(key, bytes, { httpMetadata: { contentType: `image/${match![1]}` } })
      if (record) {
        oldKey = record.avatarKey
        await tx
          .update(employeeRecord)
          .set({ avatarKey: removing ? null : key })
          .where(eq(employeeRecord.id, record.id))
      } else if (kind === 'logo') {
        oldKey = company.logoKey
        await tx.update(workspace).set({ logoKey: key }).where(eq(workspace.id, workspaceId))
      } else {
        oldKey = employee.avatarKey
        await tx
          .update(workspaceMember)
          .set({ avatarKey: key })
          .where(eq(workspaceMember.id, employee.id))
      }
    })
  } catch (error) {
    if (!removing) await bucket.delete(key)
    throw error
  }
  if (oldKey) await bucket.delete(oldKey)
  return { key: removing ? null : key }
}
export async function readMedia(db: Database, bucket: R2Bucket, userId: string, key: string) {
  const workspaceId = key.split('/')[0]
  const { company, employee } = await authorize(db, userId, workspaceId)
  const [avatar] = await db
    .select({ id: workspaceMember.id })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, workspaceId),
        eq(workspaceMember.avatarKey, key),
        eq(workspaceMember.status, 'active'),
      ),
    )
  const [record] =
    !avatar && canManage(employee.role, company, 'invite_employees')
      ? await db
          .select({ createdBy: employeeRecord.createdBy })
          .from(employeeRecord)
          .where(
            and(eq(employeeRecord.workspaceId, workspaceId), eq(employeeRecord.avatarKey, key)),
          )
      : []
  if (
    company.logoKey !== key &&
    !avatar &&
    !(record && (employee.role === 'admin' || record.createdBy === userId))
  )
    throw new AppError(404, 'Image not found.')
  const object = await bucket.get(key)
  if (!object) throw new AppError(404, 'Image not found.')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/png',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
