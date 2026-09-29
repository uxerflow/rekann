import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadViewer, loadWorkspace } from '../lib/loaders'

export const Route = createFileRoute('/workspace/$workspaceId')({
  validateSearch: (search: Record<string, unknown>) => ({
    view: ['team', 'access'].includes(String(search.view)) ? String(search.view) : 'overview',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const viewer = await loadViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
    const data = await loadWorkspace({ data: { id: params.workspaceId } })
    if (!data) throw redirect({ to: '/' })
    if (!data.employee.profileCompleted)
      throw redirect({ href: `/w/${data.workspace.slug}/onboarding/profile` })
    throw redirect({
      href: `/w/${data.workspace.slug}${deps.view === 'overview' ? '' : `/${deps.view}`}`,
    })
  },
  head: () => ({ meta: [{ title: 'Your workspace · Rekann' }] }),
})
