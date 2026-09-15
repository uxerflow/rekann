import { and, eq } from 'drizzle-orm'
import type { Database } from './db'
import { workspace, workspaceMember } from './schema'
import { AppError, authorize } from './workspaces'
import { mediaInput } from '../shared/contracts'

export async function saveMedia(db: Database, bucket: R2Bucket, userId: string, input: unknown) {
  const { workspaceId, kind, data } = mediaInput.parse(input)
  // The browser downsizes images. Accept only bounded PNG/JPEG bytes, never SVG/HTML.
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data)
  if (!match) throw new AppError(400, 'Choose a PNG or JPEG image.')
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  if (bytes.length > 250_000 || bytes.length < 16)
    throw new AppError(400, 'Choose an image smaller than 250 KB after resizing.')
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if ((match[1] === 'png' && !isPng) || (match[1] === 'jpeg' && !isJpeg))
    throw new AppError(400, 'This image format is not supported.')
  const key = `${workspaceId}/${crypto.randomUUID()}.${match[1]}`
  let oldKey: string | null = null
  try {
    await db.transaction(async (tx) => {
      const { company, employee } = await authorize(tx, userId, workspaceId, true)
      if (kind === 'logo' && employee.role !== 'admin')
        throw new AppError(403, 'Only an admin can change the company logo.')
      await bucket.put(key, bytes, { httpMetadata: { contentType: `image/${match[1]}` } })
      if (kind === 'logo') {
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
    await bucket.delete(key)
    throw error
  }
  if (oldKey) await bucket.delete(oldKey)
  return { key }
}
export async function readMedia(db: Database, bucket: R2Bucket, userId: string, key: string) {
  const workspaceId = key.split('/')[0]
  const { company } = await authorize(db, userId, workspaceId)
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
  if (company.logoKey !== key && !avatar) throw new AppError(404, 'Image not found.')
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
