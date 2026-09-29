import { TeamDirectory } from '../team/team-directory'
import { Dashboard, type DashboardState } from './dashboard'
import { DashboardShell } from './dashboard-shell'
import { useRef, useState, useEffect, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Plus, ShieldCheck, UserRound, X } from 'lucide-react'
import type { Bootstrap, WorkspaceDetails } from '../../server/workspaces'
import type { ManagerPermission, Role } from '../../server/schema'
import { api, messageOf } from '../../lib/api'
import { Avatar, Button, Field, mediaUrl, Notice, useHydrated } from '../../components/ui'
import { managerPermissions, permissionLabels, roleLabels } from '../../shared/contracts'

export function WorkspaceScreen({
  data,
  viewer,
  view,
}: {
  data: WorkspaceDetails
  viewer: Bootstrap
  view: string
}) {
  const { workspace, permissions } = data
  const router = useRouter()
  const hydrated = useHydrated()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const base = `/w/${workspace.slug}`
  async function mutate(operation: string, body: Record<string, unknown>, message: string) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await api(operation, { workspaceId: workspace.id, ...body })
      setSuccess(message)
      await router.invalidate()
    } catch (error) {
      setError(messageOf(error))
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }
  const [preview, setPreview] = useState<DashboardState | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const state = new URLSearchParams(window.location.search).get('dashboardPreview')
    if (
      state &&
      [
        'filled',
        'empty',
        'loading',
        'error',
        'setup',
        'welcome',
        'setup-progress',
        'setup-complete',
      ].includes(state)
    )
      setPreview(state as DashboardState)
  }, [])
  const [announcement, setAnnouncement] = useState('')
  return (
    <DashboardShell
      data={data}
      viewer={viewer}
      view={view}
      onUnavailable={(name) => setAnnouncement(`${name} is not available yet.`)}
    >
      {announcement && (
        <div className="dashboard-notice" role="status">
          <span>{announcement}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setAnnouncement('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <Notice>{error}</Notice>
      <Notice success>{success}</Notice>
      {view === 'overview' && (
        <Dashboard
          data={data}
          key={`${workspace.id}-${preview || 'default'}`}
          state={preview || (permissions.admin ? 'welcome' : 'empty')}
          onUnavailable={(name) => setAnnouncement(`${name} is not available yet.`)}
        />
      )}
      {view === 'team' && (
        <TeamDirectory
          key={workspace.id}
          data={data}
          onAdd={() => window.location.assign(`${base}/team/add`)}
        />
      )}
      {view === 'access' &&
        (permissions.admin || permissions.invite || permissions.remove ? (
          <>
            {permissions.admin && (
              <Access
                key={`${workspace.managersEnabled}-${workspace.managerPermissions.join(',')}`}
                data={data}
                busy={busy || !hydrated}
                mutate={mutate}
              />
            )}
            <details className="panel">
              <summary>Team access</summary>
              <Team data={data} busy={busy || !hydrated} mutate={mutate} />
            </details>
          </>
        ) : (
          <div className="empty-state">
            <ShieldCheck size={30} />
            <h1>Admin access required</h1>
            <p>Only an admin can manage roles and workspace permissions.</p>
            <a href={base}>Back to your workspace</a>
          </div>
        ))}
    </DashboardShell>
  )
}
type Mutation = (operation: string, body: Record<string, unknown>, message: string) => Promise<void>
function Team({ data, busy, mutate }: { data: WorkspaceDetails; busy: boolean; mutate: Mutation }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  async function invite(event: FormEvent) {
    event.preventDefault()
    await mutate(
      'invitation/create',
      { email, role },
      'Invitation sent. Your teammate can join from their email.',
    )
  }
  return (
    <>
      <div className="page-heading">
        <h1>Team</h1>
        <p>The people who make {data.workspace.name}.</p>
      </div>
      {data.permissions.invite && (
        <section className="panel invite-panel">
          <h2>Invite a teammate</h2>
          <p>Send an invitation to join your workspace.</p>
          <form className="invite-form" onSubmit={invite}>
            <Field
              label="Email address"
              type="email"
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
              maxLength={254}
            />
            <div className="field">
              <label htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={!data.permissions.admin}
              >
                <option value="employee">Employee</option>
                {data.workspace.managersEnabled && <option value="manager">Manager / HR</option>}
                {data.permissions.admin && <option value="admin">Admin</option>}
              </select>
            </div>
            <Button type="submit" busy={busy}>
              <Plus size={16} />
              Send invitation
            </Button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            Employees <span className="count">{data.employees.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job title</th>
                <th>Role</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((person) => (
                <tr key={person.id}>
                  <td>
                    <div className="person">
                      <Avatar
                        name={
                          [person.firstName, person.lastName].filter(Boolean).join(' ') ||
                          person.email
                        }
                        image={mediaUrl(person.avatarKey)}
                      />
                      <span>
                        <strong>
                          {[person.firstName, person.lastName].filter(Boolean).join(' ') ||
                            'Profile not completed'}
                          {person.id === data.employee.id && <small className="you-tag">You</small>}
                        </strong>
                        <small>{person.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>{person.jobTitle || '—'}</td>
                  <td>
                    {data.permissions.admin ? (
                      <select
                        aria-label={`Role for ${person.email}`}
                        value={person.role}
                        disabled={busy}
                        onChange={(e) =>
                          void mutate(
                            'employee/role',
                            { employeeId: person.id, role: e.target.value },
                            'Role updated. The new permissions apply immediately.',
                          )
                        }
                      >
                        <option value="employee">Employee</option>
                        {data.workspace.managersEnabled && (
                          <option value="manager">Manager / HR</option>
                        )}
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="role-badge">{roleLabels[person.role]}</span>
                    )}
                  </td>
                  <td>
                    {data.permissions.remove &&
                      (data.permissions.admin || person.role === 'employee') && (
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() => {
                            setRemove({ id: person.id, name: person.firstName || person.email })
                            dialog.current?.showModal()
                          }}
                        >
                          Remove
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data.permissions.invite && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Pending invitations <span className="count">{data.invitations.length}</span>
            </h2>
          </div>
          {data.invitations.length ? (
            <div className="invitation-list">
              {data.invitations.map((invite) => (
                <div className="invitation-row" key={invite.id}>
                  <div>
                    <strong>{invite.email}</strong>
                    <small>
                      {roleLabels[invite.role]} ·{' '}
                      {new Date(invite.expiresAt) < new Date()
                        ? 'Expired'
                        : invite.delivery === 'failed'
                          ? 'Email delivery failed'
                          : invite.delivery === 'sent'
                            ? 'Email sent'
                            : 'Sending'}
                    </small>
                  </div>
                  {(data.permissions.admin || invite.role === 'employee') && (
                    <div className="row-actions">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            'invitation/create',
                            { email: invite.email, role: invite.role },
                            'A new invitation has been sent.',
                          )
                        }
                      >
                        Resend invitation
                      </button>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            'invitation/revoke',
                            { invitationId: invite.id },
                            'Invitation revoked.',
                          )
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">No pending invitations. Everyone is up to date.</p>
          )}
        </section>
      )}
      <dialog ref={dialog} className="confirm-dialog" onClose={() => setRemove(null)}>
        <div className="dialog-heading">
          <h2>Remove workspace access?</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          {remove?.name} will lose access to this workspace. Their account and other workspaces will
          remain available.
        </p>
        <div className="dialog-actions">
          <Button className="secondary" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button
            className="destructive"
            onClick={() => {
              if (remove)
                void mutate(
                  'employee/remove',
                  { employeeId: remove.id },
                  'Workspace access removed.',
                )
              dialog.current?.close()
            }}
          >
            Remove access
          </Button>
        </div>
      </dialog>
    </>
  )
}
function Access({
  data,
  busy,
  mutate,
}: {
  data: WorkspaceDetails
  busy: boolean
  mutate: Mutation
}) {
  const [enabled, setEnabled] = useState(data.workspace.managersEnabled)
  const [permissions, setPermissions] = useState<ManagerPermission[]>(
    data.workspace.managerPermissions,
  )
  const [confirmDisable, setConfirmDisable] = useState(false)
  const hasManagers =
    data.employees.some((e) => e.role === 'manager') ||
    data.invitations.some((i) => i.role === 'manager')
  return (
    <>
      <div className="page-heading">
        <h1>Roles & access</h1>
        <p>Keep it simple, or delegate a little more to your team.</p>
      </div>
      <div className="role-grid">
        <div className="panel">
          <ShieldCheck size={22} />
          <h2>Admin</h2>
          <p>
            Manages the workspace, invitations, and everyone’s access. Every workspace needs at
            least one admin.
          </p>
        </div>
        <div className="panel">
          <UserRound size={22} />
          <h2>Employee</h2>
          <p>Accesses the workspace, views the team, and updates their own profile.</p>
        </div>
      </div>
      <form
        className="panel access-panel"
        onSubmit={(e) => {
          e.preventDefault()
          void mutate(
            'access/save',
            { managersEnabled: enabled, managerPermissions: permissions },
            'Workspace permissions saved.',
          )
        }}
      >
        <div className="toggle-row">
          <div>
            <h2>Manager / HR</h2>
            <p>Enable an optional role and choose what they can manage.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              aria-label="Enable Manager / HR role"
              disabled={busy}
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                setConfirmDisable(false)
              }}
            />
            <span />
          </label>
        </div>
        {enabled && (
          <div className="permission-list">
            {managerPermissions.map((permission) => (
              <label className="permission" key={permission}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={permissions.includes(permission)}
                  onChange={(e) =>
                    setPermissions(
                      e.target.checked
                        ? [...permissions, permission]
                        : permissions.filter((v) => v !== permission),
                    )
                  }
                />
                <div>
                  <strong>{permissionLabels[permission]}</strong>
                  <p>
                    {permission === 'invite_employees'
                      ? 'Send and revoke invitations for the Employee role.'
                      : 'Remove access for employees. Admins and other managers remain protected.'}
                  </p>
                </div>
              </label>
            ))}
            <p className="hint">
              Role assignment and these settings are always managed by an admin.
            </p>
          </div>
        )}
        {!enabled && hasManagers && (
          <label className="permission disable-confirm">
            <input
              type="checkbox"
              required
              checked={confirmDisable}
              onChange={(e) => setConfirmDisable(e.target.checked)}
            />
            <span>
              Change current managers and pending Manager / HR invitations to Employee. Turning the
              role back on will not restore previous assignments.
            </span>
          </label>
        )}
        <div className="form-actions">
          <span className="hint">Changes apply to existing sessions.</span>
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </>
  )
}
