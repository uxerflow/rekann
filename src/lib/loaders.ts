import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { withRuntime, json } from '../server/runtime'
import { bootstrap, identity, invitationDetails, workspaceDetails } from '../server/workspaces'
import type { Bootstrap, WorkspaceDetails } from '../server/workspaces'

export const loadViewer = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Bootstrap | null> => {
    const headers = getRequestHeaders()
    const response = await withRuntime(async ({ db, auth }) =>
      json(await bootstrap(db, await identity(auth, headers))),
    )
    if (response.status === 401) return null
    if (!response.ok) throw new Error('Unable to connect. Please try again shortly.')
    return response.json() as Promise<Bootstrap>
  },
)

export const loadInvitation = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().max(100) }))
  .handler(async ({ data }): Promise<{ name: string; emailHint: string } | { error: string }> => {
    const response = await withRuntime(async ({ db }) =>
      json(await invitationDetails(db, data.token)),
    )
    return response.json() as Promise<{ name: string; emailHint: string } | { error: string }>
  })
export const loadWorkspace = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<WorkspaceDetails | null> => {
    const headers = getRequestHeaders()
    const response = await withRuntime(async ({ db, auth }) =>
      json(await workspaceDetails(db, await identity(auth, headers), data.id)),
    )
    if ([401, 403, 404].includes(response.status)) return null
    if (!response.ok) throw new Error('Unable to load your workspace. Please try again.')
    return response.json() as Promise<WorkspaceDetails>
  })
