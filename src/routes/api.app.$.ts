import { createFileRoute } from '@tanstack/react-router'
import { json, withRuntime } from '../server/runtime'
import * as service from '../server/workspaces'
import * as detail from '../server/employee-detail'
import * as time from '../server/employee-time'
import * as documents from '../server/employee-documents'
import * as employees from '../server/employees'
import { directoryEmployees } from '../server/directory'
import { readMedia, saveMedia } from '../server/media'
import { readJson } from '../server/http'

async function handle({ request }: { request: Request }) {
  return withRuntime(async ({ db, auth, config, media }) => {
    const url = new URL(request.url)
    const operation = url.pathname.replace('/api/app/', '')
    if (request.method === 'GET' && operation === 'invitation')
      return json(await service.invitationDetails(db, url.searchParams.get('token') ?? ''))
    if (operation === 'media' && !media)
      return json({ error: 'Media storage is not configured.' }, 503)
    const viewer = await service.identity(auth, request.headers)
    const scope = [
      db,
      viewer.id,
      url.searchParams.get('workspaceId') ?? '',
      url.searchParams.get('id') ?? '',
    ] as const
    if (request.method === 'GET') {
      if (operation === 'employee/detail-options') return json(await detail.detailOptions(...scope))
      if (operation === 'employee/detail') return json(await detail.getEmployeeDetail(...scope))
      if (operation === 'employee/time')
        return json(await time.employeeTime(...scope, url.searchParams.get('month') ?? ''))
      if (operation === 'employee/documents')
        return json(await documents.employeeDocuments(...scope))
      if (operation === 'employee/document-file')
        return documents.readEmployeeDocument(
          db,
          media,
          viewer.id,
          scope[2],
          scope[3],
          url.searchParams.get('documentId') ?? '',
          url.searchParams.get('download') === '1',
        )
      if (operation === 'bootstrap') return json(await service.bootstrap(db, viewer))
      if (operation === 'workspace')
        return json(await service.workspaceDetails(db, viewer, url.searchParams.get('id') ?? ''))
      if (operation === 'directory')
        return json(
          await directoryEmployees(
            db,
            viewer.id,
            url.searchParams.get('workspaceId') ?? '',
            url.searchParams.get('includeInactive') === '1',
          ),
        )
      if (operation === 'employee/options')
        return json(
          await employees.employeeOptions(db, viewer.id, url.searchParams.get('workspaceId') ?? ''),
        )
      if (operation === 'employee/next-number')
        return json(
          await employees.nextEmployeeNumber(
            db,
            viewer.id,
            url.searchParams.get('workspaceId') ?? '',
          ),
        )
      if (operation === 'employee/record')
        return json(
          await employees.employeeDetails(
            db,
            viewer.id,
            url.searchParams.get('workspaceId') ?? '',
            url.searchParams.get('id') ?? '',
          ),
        )
      if (operation === 'media')
        return readMedia(db, media!, viewer.id, url.searchParams.get('key') ?? '')
      return json({ error: 'Not found.' }, 404)
    }
    if (request.headers.get('origin') !== new URL(config.BETTER_AUTH_URL).origin)
      return json({ error: 'This request is not allowed.' }, 403)
    if (operation === 'employee/document-upload') {
      await service.limitAction(db, viewer.id, operation, 20)
      if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024)
        return json({ error: 'Choose a file up to 20 MB.' }, 413)
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (!reader) return json({ error: 'Choose a file.' }, 400)
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 21 * 1024 * 1024) {
          await reader.cancel()
          return json({ error: 'Choose a file up to 20 MB.' }, 413)
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const form = await new Response(bytes, {
        headers: { 'content-type': request.headers.get('content-type') || '' },
      }).formData()
      const file = form.get('file')
      let metadata: unknown
      try {
        metadata = JSON.parse(String(form.get('metadata')))
      } catch {
        return json({ error: 'Invalid document information.' }, 400)
      }
      return json(
        await documents.saveEmployeeDocument(
          db,
          media,
          viewer.id,
          metadata,
          file instanceof File ? file : undefined,
        ),
      )
    }
    const body = await readJson(
      request,
      ['media', 'employee/detail-save'].includes(operation) ? 360_000 : 16_384,
    )
    await service.limitAction(db, viewer.id, operation, operation === 'invitation/create' ? 10 : 30)
    switch (operation) {
      case 'employee/detail-save':
        return json(await detail.patchEmployeeDetail(db, viewer.id, body, media))
      case 'employee/active':
        return json(await detail.setEmployeeActive(db, viewer.id, body))
      case 'employee/leave':
        return json(await time.recordEmployeeLeave(db, viewer.id, body))
      case 'employee/leave-review':
        return json(await time.reviewEmployeeLeave(db, viewer.id, body))
      case 'employee/allowance':
        return json(await time.saveEmployeeAllowance(db, viewer.id, body))
      case 'employee/clock':
        return json(await time.clockEmployee(db, viewer.id, body))
      case 'employee/document-save':
        return json(await documents.saveEmployeeDocument(db, media, viewer.id, body))
      case 'employee/document-delete':
        return json(await documents.deleteEmployeeDocument(db, viewer.id, body))
      case 'employee/save':
        return json(await employees.saveEmployee(db, viewer.id, body))
      case 'workspace/create':
        return json(await service.createWorkspace(db, viewer, body))
      case 'workspace/onboarding-update':
        return json(await service.updateOnboardingCompany(db, viewer, body))
      case 'profile/save':
        return json(await service.saveProfile(db, viewer, body))
      case 'invitation/create':
        return json(await service.createInvitation(db, config, viewer, body))
      case 'invitation/accept':
        return json(await service.acceptInvitation(db, viewer, body))
      case 'invitation/revoke':
        return json(await service.revokeInvitation(db, viewer, body))
      case 'access/save':
        return json(await service.saveAccess(db, viewer, body))
      case 'employee/role':
        return json(await service.changeEmployee(db, viewer, body, false))
      case 'employee/remove':
        return json(await service.changeEmployee(db, viewer, body, true))
      case 'media':
        return json(await saveMedia(db, media!, viewer.id, body))
      default:
        return json({ error: 'Not found.' }, 404)
    }
  })
}
export const Route = createFileRoute('/api/app/$')({
  server: { handlers: { GET: handle, POST: handle } },
})
