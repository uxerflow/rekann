import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadViewer, loadWorkspace } from '../lib/loaders'
import { WorkspaceScreen } from '../features/workspace/workspace-screen'

export const Route = createFileRoute('/workspace/$workspaceId')({
  validateSearch: (search: Record<string, unknown>) => ({
    view: ['team', 'access'].includes(String(search.view)) ? String(search.view) : 'overview',
  }),
  loader: async ({ params }) => {
    const viewer = await loadViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
    const data = await loadWorkspace({ data: { id: params.workspaceId } })
    if (!data) throw redirect({ to: '/' })
    if (!data.employee.profileCompleted)
      throw redirect({ to: '/onboarding/profile', search: { workspaceId: params.workspaceId } })
    return { viewer, data }
  },
  component: () => <WorkspaceScreen {...Route.useLoaderData()} view={Route.useSearch().view} />,
  head: () => ({ meta: [{ title: 'Your workspace · Rekann' }] }),
})
