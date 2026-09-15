import { createFileRoute } from '@tanstack/react-router'
import { json, withRuntime } from '../server/runtime'
import * as service from '../server/workspaces'
import { readMedia, saveMedia } from '../server/media'
import { readJson } from '../server/http'

async function handle({ request }: { request: Request }) {
  return withRuntime(async ({ db, auth, config, media }) => {
    const url = new URL(request.url)
    const operation = url.pathname.replace('/api/app/', '')
    if (request.method === 'GET' && operation === 'invitation')
      return json(await service.invitationDetails(db, url.searchParams.get('token') ?? ''))
    const viewer = await service.identity(auth, request.headers)
    if (request.method === 'GET') {
      if (operation === 'bootstrap') return json(await service.bootstrap(db, viewer))
      if (operation === 'workspace')
        return json(await service.workspaceDetails(db, viewer, url.searchParams.get('id') ?? ''))
      if (operation === 'media')
        return readMedia(db, media, viewer.id, url.searchParams.get('key') ?? '')
      return json({ error: 'Not found.' }, 404)
    }
    if (request.headers.get('origin') !== new URL(config.BETTER_AUTH_URL).origin)
      return json({ error: 'This request is not allowed.' }, 403)
    const body = await readJson(request, operation === 'media' ? 360_000 : 16_384)
    await service.limitAction(db, viewer.id, operation, operation === 'invitation/create' ? 10 : 30)
    switch (operation) {
      case 'workspace/create':
        return json(await service.createWorkspace(db, viewer, body))
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
        return json(await saveMedia(db, media, viewer.id, body))
      default:
        return json({ error: 'Not found.' }, 404)
    }
  })
}
export const Route = createFileRoute('/api/app/$')({
  server: { handlers: { GET: handle, POST: handle } },
})
