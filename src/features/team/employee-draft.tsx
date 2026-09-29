import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, Pin, Pencil } from 'lucide-react'
import { DashboardShell } from '../workspace/dashboard-shell'
import { Avatar, Button, Notice, mediaUrl } from '../../components/ui'
import { api, messageOf } from '../../lib/api'
import type { Bootstrap, WorkspaceDetails } from '../../server/workspaces'
import type { EmployeeDetails } from '../../server/employees'
import { employmentDates } from './directory-model'
import './add-employee.css'
import './employee-record.css'

export function EmployeeDraftScreen({
  data,
  viewer,
  recordId,
}: {
  data: WorkspaceDetails
  viewer: Bootstrap
  recordId: string
}) {
  const base = `/w/${data.workspace.slug}/team`
  const [record, setRecord] = useState<EmployeeDetails | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [sent, setSent] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [retry, setRetry] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let cancelled = false
    api<EmployeeDetails>(`employee/record?workspaceId=${data.workspace.id}&id=${recordId}`)
      .then((r) => {
        if (!cancelled) {
          setRecord(r)
          if (new URLSearchParams(location.search).has('invite') && !r.invite && !r.memberId) {
            dialog.current?.showModal()
            history.replaceState(history.state, '', location.pathname)
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e))
      })
    try {
      setPinned(
        JSON.parse(
          localStorage.getItem(`rekann:directory:${data.workspace.id}:${data.employee.id}`) || '{}',
        ).pinned?.includes(recordId) ?? false,
      )
    } catch {
      /* Optional browser preferences. */
    }
    return () => {
      cancelled = true
    }
  }, [data.workspace.id, data.employee.id, recordId, retry])
  async function send() {
    if (!record) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ inviteUrl: string }>('invitation/create', {
        workspaceId: data.workspace.id,
        email: record.email,
        role: record.fields.role,
      })
      setLink(result.inviteUrl)
      setSent(true)
      setRecord(
        await api<EmployeeDetails>(
          `employee/record?workspaceId=${data.workspace.id}&id=${recordId}`,
        ),
      )
    } catch (e) {
      setError(messageOf(e))
      setRetry((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }
  function openInvite() {
    setError('')
    setSent(false)
    dialog.current?.showModal()
  }
  function pin() {
    try {
      const key = `rekann:directory:${data.workspace.id}:${data.employee.id}`
      const preferences = JSON.parse(localStorage.getItem(key) || '{}')
      const ids = Array.isArray(preferences.pinned) ? preferences.pinned : []
      localStorage.setItem(
        key,
        JSON.stringify({
          ...preferences,
          pinned: pinned ? ids.filter((x: string) => x !== recordId) : [...ids, recordId],
        }),
      )
      setPinned(!pinned)
    } catch {
      setNotice('Your browser could not save this preference.')
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setNotice('Invitation link copied.')
    } catch {
      setError('Unable to copy. Select and copy the invitation link below.')
    }
  }
  const f = record?.fields
  const pending =
    record?.invite?.status === 'pending' && new Date(record.invite.expiresAt) > new Date()
  const expired = record?.invite?.status === 'pending' && !pending
  const failed = record?.invite?.delivery === 'failed'
  const status = record?.memberId
    ? 'Active'
    : record?.status === 'draft'
      ? 'Draft'
      : pending
        ? 'Invitation pending'
        : expired
          ? 'Invitation expired'
          : 'Not invited'
  const item = (label: string, value: string | undefined) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{value || 'Not set'}</dd>
    </div>
  )
  const dates = employmentDates(f?.startDate || null, new Date().toISOString().slice(0, 10))
  return (
    <DashboardShell
      data={data}
      viewer={viewer}
      view="team"
      title={f?.fullName || 'Employee'}
      backHref={base}
      hideAssistant
      onUnavailable={(name) => setNotice(`${name} is not available yet.`)}
    >
      <div className="employee-record-page">
        {!record ? (
          <>
            <Notice>{error}</Notice>
            {error ? (
              <Button
                onClick={() => {
                  setError('')
                  setRetry((n) => n + 1)
                }}
              >
                Try again
              </Button>
            ) : (
              <p role="status">Loading employee…</p>
            )}
          </>
        ) : (
          <>
            <Notice success>{notice}</Notice>
            <Notice>{!dialog.current?.open && error}</Notice>
            <div className="employee-record-columns">
              <aside className="employee-personal-card">
                <h2>Personal information</h2>
                <div className="employee-personal-body">
                  <Avatar name={f!.fullName} image={mediaUrl(record.avatarKey)} />
                  <span className={`employee-status ${record.memberId ? 'active' : ''}`}>
                    {status}
                  </span>
                  <div className="employee-personal-name">
                    <h1>{f!.fullName}</h1>
                    <span className="directory-badge">
                      {f!.role === 'manager' ? 'Manager / HR' : 'Employee'}
                    </span>
                  </div>
                  <p className="employee-personal-id">
                    # {record.employeeNumber} · {data.workspace.timeZone}
                  </p>
                  <div className="employee-profile-actions">
                    {!record.memberId && !record.invitationId && (
                      <a className="button secondary" href={`${base}/records/${recordId}/edit`}>
                        <Pencil size={14} />
                        Edit profile
                      </a>
                    )}
                    <button className="button secondary" onClick={pin}>
                      <Pin size={14} />
                      {pinned ? 'Unpin' : 'Pin'}
                    </button>
                  </div>
                  <details open>
                    <summary>Details</summary>
                    <dl className="employee-personal-details">
                      {item('Full name', f!.fullName)}
                      {item('Email', record.email)}
                      {item('Phone', f!.phone)}
                      {item('Date of birth', f!.birthDate)}
                      {item('Nationality', f!.nationality)}
                      {item('Gender', f!.gender)}
                      {item('Marital status', f!.maritalStatus)}
                      {item('Joined', record.memberId ? dates.date : 'Not joined yet')}
                    </dl>
                  </details>
                </div>
              </aside>
              <div className="employee-record-content">
                <nav className="employee-profile-tabs" aria-label="Employee information">
                  {['Basic information', 'Attendance', 'Leaves', 'Documents'].map((tab, i) => (
                    <button
                      key={tab}
                      aria-current={i === 0 ? 'page' : undefined}
                      onClick={() => i && setNotice(`${tab} will be available in a later phase.`)}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
                {!record.memberId && (
                  <section className="employee-invitation-banner">
                    <img src="/team/invitation.svg" width="40" height="40" alt="" />
                    <div>
                      <h2>
                        {record.status === 'draft'
                          ? 'Employee draft'
                          : failed
                            ? 'Invitation could not be sent'
                            : expired
                              ? 'Invitation expired'
                              : pending
                                ? 'Invitation pending'
                                : 'Account invitation'}
                      </h2>
                      <p>
                        {record.status === 'draft'
                          ? 'Finish the draft before inviting this employee.'
                          : failed
                            ? 'Your employee record is saved. Try sending the invitation again.'
                            : pending
                              ? `An invitation was sent to ${record.email}. Expires ${new Date(record.invite!.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                              : `Send an invitation to give ${f!.fullName.split(' ')[0]} access to the workspace.`}
                      </p>
                    </div>
                    {record.status === 'draft' ? (
                      <a href={`${base}/records/${recordId}/edit`} className="button secondary">
                        Continue draft
                      </a>
                    ) : (
                      <Button className="secondary" onClick={openInvite}>
                        {pending || failed
                          ? 'Resend invitation'
                          : expired
                            ? 'Send new invitation'
                            : 'Send invitation'}
                      </Button>
                    )}
                  </section>
                )}
                <section>
                  <div className="employee-section-heading">
                    <h2>Work information</h2>
                    {!record.invitationId && !record.memberId && (
                      <a className="button secondary" href={`${base}/records/${recordId}/edit`}>
                        Edit
                      </a>
                    )}
                  </div>
                  <div className="employee-work-cards">
                    <article>
                      <img src="/team/work-position.svg" width="24" height="24" alt="" />
                      <h3>Position & department</h3>
                      <strong>{f!.jobTitle || 'Not set'}</strong>
                      <p>{f!.department || 'Not set'}</p>
                    </article>
                    <article>
                      <img src="/team/work-type.svg" width="24" height="24" alt="" />
                      <h3>Employment type</h3>
                      <span className="directory-badge">{f!.employmentType || 'Not set'}</span>
                      <p>{f!.workSchedule || 'No schedule set'}</p>
                    </article>
                    <article>
                      <img src="/team/work-start.svg" width="24" height="24" alt="" />
                      <h3>Start date</h3>
                      <strong>{dates.date}</strong>
                      <p>{dates.tenure}</p>
                    </article>
                  </div>
                </section>
                <section className="employee-details-section">
                  <h2>Personal details</h2>
                  <article>
                    <h3>Identification</h3>
                    <dl>
                      {item('National ID', f!.nationalId)}
                      {item('Personal tax ID', f!.taxId)}
                      {item('Driving license', f!.drivingLicense)}
                      {item('Health insurance', f!.healthInsurance)}
                      {item('Social insurance', f!.socialInsurance)}
                    </dl>
                  </article>
                  <article>
                    <h3>Address information</h3>
                    <dl>
                      {item('Address', f!.address)}
                      {item('City', f!.city)}
                      {item('Province / State', f!.province)}
                      {item('ZIP code', f!.zipCode)}
                      {item('Country', f!.country)}
                    </dl>
                  </article>
                  <article>
                    <h3>Emergency contact</h3>
                    <dl>
                      {item('Full name', f!.emergencyName)}
                      {item('Phone', f!.emergencyPhone)}
                      {item('Relationship', f!.emergencyRelationship)}
                    </dl>
                  </article>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
      <dialog
        ref={dialog}
        className="confirm-dialog employee-dialog"
        aria-labelledby="invitation-dialog-title"
        onCancel={(e) => {
          if (busy) e.preventDefault()
        }}
      >
        <div className="employee-dialog-art">
          <Avatar name={f?.fullName || ''} image={mediaUrl(record?.avatarKey)} />
          {sent ? <Check size={20} /> : <ArrowRight size={20} />}
          <Avatar name={data.workspace.name} image={mediaUrl(data.workspace.logoKey)} />
        </div>
        <h2 id="invitation-dialog-title">{sent ? 'Invitation sent' : 'Send an invitation?'}</h2>
        <p>
          {sent
            ? `An onboarding invitation has been sent to ${record?.email}.`
            : `Invite ${f?.fullName} at ${record?.email} to join ${data.workspace.name} using their work email.`}
        </p>
        <Notice>{error}</Notice>
        <Notice success>{notice}</Notice>
        {sent && error && <input aria-label="Invitation link" readOnly value={link} />}
        <div className="employee-dialog-actions">
          {sent ? (
            <>
              <Button className="secondary" onClick={() => void copy()}>
                <Copy size={14} />
                Copy invite link
              </Button>
              <Button onClick={() => dialog.current?.close()}>Done</Button>
            </>
          ) : (
            <>
              <Button className="secondary" disabled={busy} onClick={() => dialog.current?.close()}>
                Invite later
              </Button>
              <Button busy={busy} onClick={() => void send()}>
                Send invitation
              </Button>
            </>
          )}
        </div>
      </dialog>
    </DashboardShell>
  )
}
