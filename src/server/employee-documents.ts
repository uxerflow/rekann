import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Database, Transaction } from './db'
import { employeeDocument } from './schema'
import { AppError } from './workspaces'
import { detailAccess, detailAudit } from './employee-detail'
import { detailScope, documentInput, safeDocumentUrl } from '../shared/employee-detail'

async function documentAccess(
  db: Database | Transaction,
  viewerId: string,
  workspaceId: string,
  id: string,
  write = false,
) {
  const a = await detailAccess(db, viewerId, workspaceId, id, write)
  if (!a.member || !a.canPrivate || (write && !a.canEdit))
    throw new AppError(403, 'You cannot access these documents.')
  return { ...a, member: a.member }
}
export async function employeeDocuments(
  db: Database,
  viewerId: string,
  workspaceId: string,
  id: string,
) {
  const a = await documentAccess(db, viewerId, workspaceId, id)
  const rows = await db
    .select()
    .from(employeeDocument)
    .where(
      and(
        eq(employeeDocument.workspaceId, workspaceId),
        eq(employeeDocument.memberId, a.member.id),
        isNull(employeeDocument.deletedAt),
      ),
    )
    .orderBy(desc(employeeDocument.createdAt))
  return rows
    .filter((r) => a.canEdit || r.visibleToEmployee)
    .map(({ key, deletedBy, ...r }) => ({ ...r, hasFile: !!key }))
}
export type EmployeeDocument = Awaited<ReturnType<typeof employeeDocuments>>[number]
const maxBytes = 20 * 1024 * 1024
export async function saveEmployeeDocument(
  db: Database,
  bucket: R2Bucket | undefined,
  viewerId: string,
  raw: unknown,
  file?: File,
) {
  const p = documentInput.parse(raw)
  let bytes: Uint8Array | undefined, mime: string | undefined, key: string | undefined
  if (file) {
    if (!bucket) throw new AppError(503, 'Document storage is not configured.')
    if (file.size > maxBytes || file.size < 16)
      throw new AppError(400, 'Choose a PDF, PNG or JPG file up to 20 MB.')
    // Authorize before reading or storing uploaded bytes.
    await documentAccess(db, viewerId, p.workspaceId, p.id, true)
    bytes = new Uint8Array(await file.arrayBuffer())
    mime = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes![i] === b)
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'image/jpeg'
        : new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
          ? 'application/pdf'
          : undefined
    if (!mime || file.type !== mime)
      throw new AppError(400, 'The file contents do not match a supported PDF, PNG or JPG format.')
    key = `${p.workspaceId}/documents/${crypto.randomUUID()}`
  }
  if (p.url && !safeDocumentUrl(p.url))
    throw new AppError(400, 'Enter a valid HTTPS link without a username or password.')
  try {
    return await db.transaction(async (tx) => {
      const a = await documentAccess(tx, viewerId, p.workspaceId, p.id, true)
      const [existing] = await tx
        .select()
        .from(employeeDocument)
        .where(eq(employeeDocument.id, p.documentId))
      if (
        existing &&
        (existing.workspaceId !== p.workspaceId ||
          existing.memberId !== a.member.id ||
          existing.deletedAt)
      )
        throw new AppError(404, 'Document not found.')
      if ((existing?.version || 0) !== p.version)
        throw new AppError(409, 'This document changed. Refresh before saving it again.')
      if (!file && !p.url && !existing?.key)
        throw new AppError(400, 'Choose a file or enter a link.')
      if (file && p.url) throw new AppError(400, 'Choose a file or a link, not both.')
      if (key) await bucket!.put(key, bytes!, { httpMetadata: { contentType: mime! } })
      const values = {
        title: p.title,
        category: p.category,
        visibleToEmployee: p.visibleToEmployee,
        ...(file
          ? { key, url: null, mime, fileName: file.name.slice(0, 200), size: file.size }
          : p.url
            ? { key: null, url: safeDocumentUrl(p.url), mime: null, fileName: null, size: null }
            : {}),
        version: (existing?.version || 0) + 1,
      }
      if (existing)
        await tx.update(employeeDocument).set(values).where(eq(employeeDocument.id, p.documentId))
      else
        await tx.insert(employeeDocument).values({
          ...values,
          id: p.documentId,
          workspaceId: p.workspaceId,
          memberId: a.member.id,
          createdBy: viewerId,
        })
      await detailAudit(
        tx,
        p.workspaceId,
        viewerId,
        existing ? 'document.updated' : 'document.uploaded',
        p.documentId,
      )
      return { ok: true, id: p.documentId }
    })
  } catch (error) {
    if (key) await bucket!.delete(key)
    throw error
  }
}
export async function deleteEmployeeDocument(db: Database, viewerId: string, raw: unknown) {
  const p = detailScope
    .extend({ documentId: z.uuid(), restore: z.boolean().default(false) })
    .parse(raw)
  return db.transaction(async (tx) => {
    const a = await documentAccess(tx, viewerId, p.workspaceId, p.id, true)
    const [doc] = await tx
      .select()
      .from(employeeDocument)
      .where(
        and(
          eq(employeeDocument.id, p.documentId),
          eq(employeeDocument.workspaceId, p.workspaceId),
          eq(employeeDocument.memberId, a.member.id),
        ),
      )
    if (!doc) throw new AppError(404, 'Document not found.')
    if (
      p.restore &&
      (!doc.deletedAt ||
        doc.deletedBy !== viewerId ||
        Date.now() - doc.deletedAt.getTime() > 30_000)
    )
      throw new AppError(410, 'The undo period has expired.')
    if (!p.restore && doc.deletedAt) return { ok: true }
    await tx
      .update(employeeDocument)
      .set({
        deletedAt: p.restore ? null : new Date(),
        deletedBy: p.restore ? null : viewerId,
        version: doc.version + 1,
      })
      .where(eq(employeeDocument.id, doc.id))
    await detailAudit(
      tx,
      p.workspaceId,
      viewerId,
      p.restore ? 'document.restored' : 'document.deleted',
      doc.id,
    )
    return { ok: true }
  })
}
export async function readEmployeeDocument(
  db: Database,
  bucket: R2Bucket | undefined,
  viewerId: string,
  workspaceId: string,
  id: string,
  documentId: string,
  download: boolean,
) {
  const a = await documentAccess(db, viewerId, workspaceId, id)
  const [doc] = await db
    .select()
    .from(employeeDocument)
    .where(
      and(
        eq(employeeDocument.id, documentId),
        eq(employeeDocument.workspaceId, workspaceId),
        eq(employeeDocument.memberId, a.member.id),
        isNull(employeeDocument.deletedAt),
      ),
    )
  if (!doc || (!a.canEdit && !doc.visibleToEmployee)) throw new AppError(404, 'Document not found.')
  if (!doc.key || !bucket) throw new AppError(404, 'File not found.')
  const object = await bucket.get(doc.key)
  if (!object) throw new AppError(404, 'File not found.')
  const name = encodeURIComponent(doc.fileName || doc.title).replace(/'/g, '%27')
  return new Response(object.body, {
    headers: {
      'content-type': doc.mime!,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "sandbox; default-src 'none'",
      'referrer-policy': 'no-referrer',
    },
  })
}
