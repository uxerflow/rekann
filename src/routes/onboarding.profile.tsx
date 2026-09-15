import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadWorkspace } from '../lib/loaders'

export const Route = createFileRoute('/onboarding/profile')({
  validateSearch: (search: Record<string, unknown>) => ({
    workspaceId: typeof search.workspaceId === 'string' ? search.workspaceId : '',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (!deps.workspaceId) throw redirect({ to: '/' })
    const data = await loadWorkspace({ data: { id: deps.workspaceId } })
    if (!data) throw redirect({ to: '/' })
    throw redirect({
      href: `/w/${data.workspace.slug}/${data.employee.profileCompleted ? 'profile' : 'onboarding/profile'}`,
    })
  },
  head: () => ({ meta: [{ title: 'Your profile · Rekann' }] }),
})
