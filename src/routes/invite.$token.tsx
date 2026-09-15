import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Mail } from 'lucide-react'
import { loadInvitation, loadViewer } from '../lib/loaders'
import { AuthLayout } from '../components/auth-layout'
import { Button, Notice } from '../components/ui'
import { api, messageOf, signOut } from '../lib/api'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ params }) => ({
    invitation: await loadInvitation({ data: { token: params.token } }),
    viewer: await loadViewer(),
  }),
  component: Invitation,
  head: () => ({
    meta: [{ title: 'Join your team · Rekann' }, { name: 'referrer', content: 'no-referrer' }],
  }),
})
function Invitation() {
  const { invitation, viewer } = Route.useLoaderData()
  const { token } = Route.useParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function accept() {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ workspaceId: string; profileCompleted: boolean }>(
        'invitation/accept',
        { token },
      )
      window.location.assign(
        result.profileCompleted
          ? `/workspace/${result.workspaceId}`
          : `/onboarding/profile?workspaceId=${result.workspaceId}`,
      )
    } catch (error) {
      setError(messageOf(error))
      setBusy(false)
    }
  }
  if ('error' in invitation)
    return (
      <AuthLayout title="Invitation unavailable" subtitle={invitation.error}>
        <a className="button secondary" href="/">
          Back to Rekann
        </a>
      </AuthLayout>
    )
  const next = encodeURIComponent(`/invite/${token}`)
  return (
    <AuthLayout
      title={`Join ${invitation.name}`}
      subtitle="You’ve been invited to your team’s workspace."
    >
      <div className="invite-icon">
        <Mail size={26} />
      </div>
      <p className="centered muted">
        Invitation for <strong>{invitation.emailHint}</strong>
      </p>
      <Notice>{error}</Notice>
      {viewer ? (
        <div className="form-stack">
          <p className="centered">
            Signed in as <strong>{viewer.user.email}</strong>
          </p>
          <Button busy={busy} onClick={() => void accept()}>
            <CheckCircle2 size={16} />
            Accept invitation
          </Button>
          <button
            className="text-button"
            onClick={() =>
              void signOut(`/sign-in?next=${next}`).catch((e) => setError(messageOf(e)))
            }
          >
            Sign out to use a different account
          </button>
        </div>
      ) : (
        <div className="form-stack">
          <a className="button" href={`/sign-up?next=${next}`}>
            Create an account
          </a>
          <a className="button secondary" href={`/sign-in?next=${next}`}>
            I already have an account
          </a>
        </div>
      )}
      <p className="hint centered">Use the email address that received this invitation.</p>
    </AuthLayout>
  )
}
