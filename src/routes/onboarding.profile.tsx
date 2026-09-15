import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadWorkspace } from '../lib/loaders'
import { ProfileOnboarding } from '../features/onboarding/onboarding'

export const Route = createFileRoute('/onboarding/profile')({
  validateSearch: (search: Record<string, unknown>) => ({
    workspaceId: typeof search.workspaceId === 'string' ? search.workspaceId : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (!deps.workspaceId) throw redirect({ to: '/' })
    const data = await loadWorkspace({ data: { id: deps.workspaceId } })
    if (!data) throw redirect({ to: '/' })
    return data
  },
  component: () => (
    <ProfileOnboarding
      data={Route.useLoaderData()}
      editing={Route.useLoaderData().employee.profileCompleted}
    />
  ),
  head: () => ({ meta: [{ title: 'Your profile · Rekann' }] }),
})
