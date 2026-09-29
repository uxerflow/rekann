import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadViewer } from '../lib/loaders'
import { CompanyOnboarding } from '../features/onboarding/onboarding'

export const Route = createFileRoute('/onboarding/company')({
  validateSearch: (search: Record<string, unknown>): { newWorkspace?: boolean } => ({
    newWorkspace: search.newWorkspace === true || search.newWorkspace === 'true' || undefined,
  }),
  beforeLoad: async ({ search }) => {
    const viewer = await loadViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
    if (viewer.workspaces.length > 0 && !search.newWorkspace) throw redirect({ to: '/' })
  },
  component: CompanyOnboarding,
  head: () => ({ meta: [{ title: 'About your company · Rekann' }] }),
})
