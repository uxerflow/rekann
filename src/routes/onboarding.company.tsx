import { createFileRoute, redirect } from '@tanstack/react-router'
import { loadViewer } from '../lib/loaders'
import { CompanyOnboarding } from '../features/onboarding/onboarding'

export const Route = createFileRoute('/onboarding/company')({
  beforeLoad: async () => {
    if (!(await loadViewer()))
      throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
  },
  component: CompanyOnboarding,
  head: () => ({ meta: [{ title: 'About your company · Rekann' }] }),
})
