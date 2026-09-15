import { createFileRoute, redirect, useLocation, notFound } from '@tanstack/react-router'
import { loadViewer, loadWorkspaceSlug } from '../lib/loaders'
import { WorkspaceScreen } from '../features/workspace/workspace-screen'
import { ProfileOnboarding } from '../features/onboarding/onboarding'

export const Route = createFileRoute('/w/$slug')({
  beforeLoad: async ({ params, location }) => {
    const viewer = await loadViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
    const data = await loadWorkspaceSlug({ data: { slug: params.slug } })
    if (!data) throw notFound()
    const base = `/w/${data.workspace.slug}`
    const section = location.pathname.slice(base.length).replace(/\/$/, '')
    if (
      !['', '/team', '/access', '/profile', '/onboarding/company', '/onboarding/profile'].includes(
        section,
      )
    )
      throw notFound()
    const onboarding = section.startsWith('/onboarding/')
    if (!data.employee.profileCompleted && !onboarding)
      throw redirect({ href: `${base}/onboarding/profile` })
    if (data.employee.profileCompleted && onboarding) throw redirect({ href: base })
    if (section === '/onboarding/company' && data.workspace.createdBy !== data.employee.userId)
      throw redirect({ href: `${base}/onboarding/profile` })
    return { viewer, data }
  },
  component: WorkspaceRoute,
  head: () => ({ meta: [{ title: 'Your workspace · Rekann' }] }),
})
function WorkspaceRoute() {
  const { viewer, data } = Route.useRouteContext()
  const pathname = useLocation({ select: (location) => location.pathname })
  if (pathname.endsWith('/profile') || pathname.endsWith('/onboarding/company'))
    return (
      <ProfileOnboarding
        data={data}
        editing={data.employee.profileCompleted}
        companyStep={pathname.endsWith('/onboarding/company')}
      />
    )
  return (
    <WorkspaceScreen
      viewer={viewer}
      data={data}
      view={
        pathname.endsWith('/team') ? 'team' : pathname.endsWith('/access') ? 'access' : 'overview'
      }
    />
  )
}
