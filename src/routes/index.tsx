import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { loadViewer } from '../lib/loaders'
import { AuthLayout } from '../components/auth-layout'
import { Avatar } from '../components/ui'
import { roleLabels } from '../shared/contracts'

export const Route = createFileRoute('/')({
  loader: async () => {
    const data = await loadViewer()
    if (!data) throw redirect({ to: '/sign-in', search: { email: '', next: '', reset: false } })
    if (data.workspaces.length === 1) {
      const company = data.workspaces[0]
      if (!company.profileCompleted)
        throw redirect({ to: '/onboarding/profile', search: { workspaceId: company.id } })
      throw redirect({
        to: '/workspace/$workspaceId',
        params: { workspaceId: company.id },
        search: { view: 'overview' },
      })
    }
    return data
  },
  component: WorkspacePicker,
})
function WorkspacePicker() {
  const data = Route.useLoaderData()
  return (
    <AuthLayout
      title={data.workspaces.length ? 'Choose your workspace' : 'Welcome to Rekann'}
      subtitle={
        data.workspaces.length
          ? 'Where would you like to work today?'
          : 'Create a workspace for your team, or open the invitation link from your email.'
      }
    >
      <div className="workspace-picker">
        {data.workspaces.map((company) => (
          <a
            className="workspace-choice"
            key={company.id}
            href={
              company.profileCompleted
                ? `/workspace/${company.id}`
                : `/onboarding/profile?workspaceId=${company.id}`
            }
          >
            <Avatar name={company.name} />
            <span>
              <strong>{company.name}</strong>
              <small>{roleLabels[company.role]}</small>
            </span>
            <ArrowRight size={18} />
          </a>
        ))}
        <a className="button secondary" href="/onboarding/company">
          <Plus size={16} />
          Create a workspace
        </a>
      </div>
    </AuthLayout>
  )
}
