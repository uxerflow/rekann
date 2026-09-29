import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Globe,
  Hash,
  Mail,
  MoreHorizontal,
  Pencil,
  Pin,
  UserRound,
  Phone,
  Cake,
  Heart,
  ContactRound,
  VenusAndMars,
  ChevronDown,
} from 'lucide-react'
import { DashboardShell } from '../workspace/dashboard-shell'
import { Avatar, Button, Notice, mediaUrl } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { api, messageOf } from '../../lib/api'
import type { Bootstrap, WorkspaceDetails } from '../../server/workspaces'
import type { EmployeeDetail } from '../../server/employee-detail'
import type { EmployeeTime } from '../../server/employee-time'
import type { EmployeeDocument } from '../../server/employee-documents'
import type { employeeOptions } from '../../server/employees'
import { dayInZone, sectionFields } from '../../shared/employee-detail'
import { employmentDates } from './directory-model'
import { EmployeeDraftScreen } from './employee-draft'
import { DetailToast } from './detail-toast'
import { DetailEdit } from './detail-edit'
import { DetailDialog } from './detail-dialog'
import { DetailAttendance, DetailLeaves, DetailEmpty, formatDate } from './detail-time'
import { DetailDocuments } from './detail-documents'
import './add-employee.css'
import './employee-record.css'
import './employee-detail.css'

export function EmployeeRecordScreen({
  data,
  viewer,
  recordId,
}: {
  data: WorkspaceDetails
  viewer: Bootstrap
  recordId: string
}) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [time, setTime] = useState<EmployeeTime | null>(null)
  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [options, setOptions] = useState<Awaited<ReturnType<typeof employeeOptions>> | null>(null)
  const [tab, setTab] = useState('Basic information')
  const [month, setMonth] = useState(() =>
    dayInZone(new Date(), data.workspace.timeZone).slice(0, 7),
  )
  const [error, setError] = useState('')
  const [tabError, setTabError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tabLoading, setTabLoading] = useState(false)
  const [edit, setEdit] = useState<keyof typeof sectionFields | null>(null)
  const [action, setAction] = useState<'access' | 'deactivate' | 'reactivate' | 'invite' | null>(
    null,
  )
  const [role, setRole] = useState('employee')
  const [menu, setMenu] = useState(false)
  const [pinned, setPinned] = useState(false)
  const actionMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const outside = (event: PointerEvent) => {
      if (!actionMenu.current?.contains(event.target as Node)) setMenu(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false)
        actionMenu.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [menu])
  const [refresh, setRefresh] = useState(0)
  const workspaceId = data.workspace.id
  const scope = `workspaceId=${encodeURIComponent(workspaceId)}&id=${encodeURIComponent(recordId)}`
  const reload = useCallback(async () => {
    const d = await api<EmployeeDetail>(`employee/detail?${scope}`)
    if (d.memberId && d.permissions.private) {
      const [t, docs] = await Promise.all([
        api<EmployeeTime>(`employee/time?${scope}&month=${month}`),
        api<EmployeeDocument[]>(`employee/documents?${scope}`),
      ])
      setTime(t)
      setDocuments(docs)
    }
    setDetail(d)
    setError('')
  }, [scope, month])
  useEffect(() => {
    let cancelled = false
    api<EmployeeDetail>(`employee/detail?${scope}`)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e))
      })
    return () => {
      cancelled = true
    }
  }, [scope])
  useEffect(() => {
    if (!detail?.permissions.edit) return
    let cancelled = false
    api<Awaited<ReturnType<typeof employeeOptions>>>(`employee/detail-options?${scope}`)
      .then((o) => {
        if (!cancelled) setOptions(o)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [scope, detail?.permissions.edit])
  useEffect(() => {
    if (!detail?.memberId || !detail.permissions.private) return
    let cancelled = false
    setTabError('')
    setTabLoading(true)
    Promise.all([
      api<EmployeeTime>(`employee/time?${scope}&month=${month}`),
      api<EmployeeDocument[]>(`employee/documents?${scope}`),
    ])
      .then(([t, d]) => {
        if (!cancelled) {
          setTime(t)
          setDocuments(d)
        }
      })
      .catch((e) => {
        if (!cancelled) setTabError(messageOf(e))
      })
      .finally(() => {
        if (!cancelled) setTabLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, month, refresh, detail?.memberId, detail?.permissions.private])
  useEffect(() => {
    try {
      const pref = JSON.parse(
        localStorage.getItem(`rekann:directory:${workspaceId}:${data.employee.id}`) || '{}',
      )
      setPinned(pref.pinned?.includes(detail?.memberId || recordId) || false)
    } catch {
      /* Optional preference. */
    }
  }, [workspaceId, data.employee.id, recordId, detail?.memberId])
  useEffect(() => {
    setNotice('')
  }, [tab])
  function pin() {
    try {
      const key = `rekann:directory:${workspaceId}:${data.employee.id}`
      const pref = JSON.parse(localStorage.getItem(key) || '{}')
      const id = detail?.memberId || recordId
      const pins = Array.isArray(pref.pinned) ? pref.pinned : []
      localStorage.setItem(
        key,
        JSON.stringify({
          ...pref,
          pinned: pinned ? pins.filter((v: string) => v !== id) : [...pins, id],
        }),
      )
      setPinned(!pinned)
    } catch {
      setNotice('Your browser could not save this preference.')
    }
  }
  async function perform() {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      if (action === 'access')
        await api('employee/role', { workspaceId, employeeId: detail.memberId, role })
      if (action === 'deactivate' || action === 'reactivate')
        await api('employee/active', {
          workspaceId,
          id: detail.id,
          active: action === 'reactivate',
        })
      if (action === 'invite')
        await api('invitation/create', {
          workspaceId,
          email: detail.fields.email,
          role: detail.role,
        })
      await reload()
      setNotice(action === 'invite' ? 'Invitation sent.' : 'Changes saved.')
      setAction(null)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  if (detail && !detail.memberId)
    return <EmployeeDraftScreen data={data} viewer={viewer} recordId={recordId} />
  const f = detail?.fields
  const dates = employmentDates(
    f?.startDate || null,
    dayInZone(new Date(), data.workspace.timeZone),
  )
  const profileIcons: Record<string, typeof UserRound> = {
    'Full name': ContactRound,
    Email: Mail,
    Phone,
    'Date of birth': Cake,
    Nationality: Globe,
    Gender: VenusAndMars,
    'Marital status': Heart,
    Joined: CalendarDays,
  }
  const item = (label: string, value: string | undefined) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{value || 'Not set'}</dd>
    </div>
  )
  const personalItem = (label: string, value: string | undefined) => {
    const Icon = profileIcons[label] || UserRound
    return (
      <div key={label}>
        <dt>
          <Icon size={14} />
          {label}
        </dt>
        <dd>{value || 'Not set'}</dd>
      </div>
    )
  }
  const canPersonal = detail?.permissions.edit || detail?.permissions.self
  const section = (title: string, key: keyof typeof sectionFields, rows: [string, string][]) => (
    <article className={`detail-section-${key}`}>
      <div className="employee-section-heading">
        <h3>{title}</h3>
        {(detail?.permissions.edit ||
          (['address', 'emergency'].includes(key) && detail?.permissions.self)) && (
          <Button
            className="secondary"
            aria-label={`Edit ${title.toLowerCase()}`}
            onClick={() => setEdit(key)}
          >
            Edit
          </Button>
        )}
      </div>
      <dl>{rows.map(([k, v]) => item(k, v))}</dl>
      {key === 'emergency' && detail?.additionalContact?.name && (
        <dl className="detail-contact-divider">
          {item('Full name', detail.additionalContact.name)}
          {item('Phone', detail.additionalContact.phone)}
          {item('Relationship', detail.additionalContact.relationship)}
        </dl>
      )}
    </article>
  )
  return (
    <DashboardShell
      data={data}
      viewer={viewer}
      view="team"
      title={f?.fullName || 'Employee'}
      backHref={`/w/${data.workspace.slug}/team`}
      hideAssistant
      onUnavailable={(name) => setNotice(`${name} is not available yet.`)}
    >
      <div className="employee-record-page">
        <DetailToast message={notice} onDismiss={() => setNotice('')} />
        {!action && !edit && <Notice>{error}</Notice>}
        {!detail ? (
          <div className="detail-loading" role="status">
            {error ? (
              <Button
                className="secondary"
                onClick={() => void reload().catch((e) => setError(messageOf(e)))}
              >
                Try again
              </Button>
            ) : (
              'Loading employee…'
            )}
          </div>
        ) : (
          <div className="employee-record-columns">
            <aside className="employee-personal-card">
              <h2>Personal information</h2>
              <div className="employee-personal-body">
                <button
                  className="detail-avatar-button"
                  disabled={!canPersonal}
                  onClick={() => {
                    setEdit('profile')
                    setError('')
                  }}
                  aria-label="Edit profile photo"
                >
                  <Avatar name={f!.fullName} image={mediaUrl(detail.avatarKey)} />
                </button>
                <span className={`employee-status ${detail.inactive ? '' : 'active'}`}>
                  {detail.inactive ? 'Inactive' : 'Active'}
                </span>
                <div className="employee-personal-name">
                  <h1>{f!.fullName}</h1>
                  <span className="directory-badge">
                    {detail.role === 'admin'
                      ? 'Admin'
                      : detail.role === 'manager'
                        ? 'Manager / HR'
                        : 'Employee'}
                  </span>
                </div>
                <p className="employee-personal-id">
                  <Hash size={14} />
                  {f!.employeeNumber || 'Not assigned'}
                  <span>·</span>
                  <Globe size={14} />
                  {data.workspace.timeZone}
                </p>
                <div className="employee-profile-actions">
                  {canPersonal && (
                    <Button className="secondary" onClick={() => setEdit('profile')}>
                      <Pencil size={14} />
                      Edit profile
                    </Button>
                  )}
                  <Button className="secondary" aria-pressed={pinned} onClick={pin}>
                    <Pin size={14} />
                    {pinned ? 'Unpin' : 'Pin'}
                  </Button>
                  {detail.permissions.admin && !detail.permissions.self && (
                    <div className="detail-row-menu" ref={actionMenu}>
                      <Button
                        className="secondary"
                        aria-label="Employee actions"
                        aria-expanded={menu}
                        onClick={() => setMenu(!menu)}
                      >
                        <MoreHorizontal size={16} />
                      </Button>
                      {menu && (
                        <div className="detail-menu">
                          <button
                            disabled={!detail.accountActive}
                            onClick={() => {
                              setRole(detail.role)
                              setAction('access')
                              setMenu(false)
                              setError('')
                            }}
                          >
                            Manage account access
                          </button>
                          <button
                            className="danger-text"
                            onClick={() => {
                              setAction(detail.inactive ? 'reactivate' : 'deactivate')
                              setMenu(false)
                              setError('')
                            }}
                          >
                            {detail.inactive ? 'Reactivate employee' : 'Deactivate employee'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <details open>
                  <summary>
                    <ChevronDown size={12} />
                    Details
                  </summary>
                  <dl className="employee-personal-details">
                    {personalItem('Full name', f!.fullName)}
                    {personalItem('Email', f!.email)}
                    {detail.permissions.private && (
                      <>
                        {personalItem('Phone', f!.phone)}
                        {tab === 'Basic information' && (
                          <>
                            {personalItem(
                              'Date of birth',
                              [f!.birthPlace, f!.birthDate ? formatDate(f!.birthDate) : '']
                                .filter(Boolean)
                                .join(', '),
                            )}
                            {personalItem('Nationality', f!.nationality)}
                            {personalItem('Gender', f!.gender)}
                            {personalItem('Marital status', f!.maritalStatus)}
                            {personalItem('Joined', dates.date)}
                          </>
                        )}
                      </>
                    )}
                  </dl>
                  {canPersonal && tab === 'Basic information' && (
                    <button
                      className="text-button detail-edit-personal"
                      onClick={() => setEdit('personal')}
                    >
                      Edit personal information
                    </button>
                  )}
                </details>
                {detail.permissions.private && (
                  <div className="detail-year-statistics">
                    <p>
                      <CalendarDays size={14} />
                      Statistics · {month.slice(0, 4)}
                    </p>
                    <div>
                      {[
                        ['Present', time?.statistics.present],
                        ['Late', time?.statistics.late],
                        ['Leaves', time?.statistics.leaves],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <strong
                            className={
                              label === 'Late' && value === null ? 'detail-untracked' : undefined
                            }
                          >
                            {tabError
                              ? 'Unavailable'
                              : (value ?? (label === 'Late' && time ? 'Not tracked' : '…'))}
                          </strong>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
            <div className="employee-record-content" aria-busy={tabLoading}>
              <nav className="employee-profile-tabs" aria-label="Employee information">
                {['Basic information', 'Attendance', 'Leaves', 'Documents'].map((t) => (
                  <button
                    key={t}
                    aria-current={t === tab ? 'page' : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {detail.inactive ? (
                <div className="employee-invitation-banner">
                  <div>
                    <h2>This employee is inactive.</h2>
                    <p>Their records and documents are retained.</p>
                  </div>
                  {detail.permissions.admin && (
                    <Button className="secondary" onClick={() => setAction('reactivate')}>
                      Reactivate employee
                    </Button>
                  )}
                </div>
              ) : (
                !detail.accountActive &&
                detail.permissions.admin && (
                  <div className="employee-invitation-banner">
                    <div>
                      <h2>Workspace access is not active</h2>
                      <p>Send a new invitation to restore access.</p>
                    </div>
                    <Button className="secondary" onClick={() => setAction('invite')}>
                      {detail.invite?.status === 'pending'
                        ? 'Resend invitation'
                        : 'Send invitation'}
                    </Button>
                  </div>
                )
              )}
              {tab === 'Basic information' ? (
                <>
                  <section>
                    <div className="employee-section-heading">
                      <h2>Work information</h2>
                      {detail.permissions.edit && (
                        <Button
                          className="secondary"
                          aria-label="Edit work information"
                          onClick={() => setEdit('work')}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                    <div className="employee-work-cards">
                      {[
                        [
                          'Position & department',
                          f!.jobTitle || 'Not set',
                          f!.department || 'Not set',
                          'position',
                        ],
                        [
                          'Employment type',
                          f!.employmentType || 'Not set',
                          f!.workSchedule || 'No schedule set',
                          'type',
                        ],
                        ['Start date', dates.date, dates.tenure, 'start'],
                      ].map(([label, value, note, icon]) => (
                        <article key={label}>
                          <img src={`/team/work-${icon}.svg`} width={24} height={24} alt="" />
                          <h3>{label}</h3>
                          {icon === 'type' ? (
                            <span className={`directory-badge type-${value.toLowerCase()}`}>
                              {value}
                            </span>
                          ) : (
                            <strong>{value}</strong>
                          )}
                          <p>{note}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                  {detail.permissions.private && (
                    <section className="employee-details-section">
                      <h2>Personal details</h2>
                      {section('Identification', 'identification', [
                        ['National ID', f!.nationalId],
                        ['Health insurance', f!.healthInsurance],
                        ['Personal tax ID', f!.taxId],
                        ['Social insurance', f!.socialInsurance],
                        ['Driving license', f!.drivingLicense],
                      ])}
                      {section('Address information', 'address', [
                        ['Address', f!.address],
                        ['City', f!.city],
                        ['State or province', f!.province],
                        ['Postal code', f!.zipCode],
                        ['Country', f!.country],
                      ])}
                      {section('Emergency contact', 'emergency', [
                        ['Full name', f!.emergencyName],
                        ['Phone', f!.emergencyPhone],
                        ['Relationship', f!.emergencyRelationship],
                      ])}
                    </section>
                  )}
                </>
              ) : !detail.permissions.private ? (
                <DetailEmpty
                  title="You don’t have access to this information"
                  body="Contact your workspace admin if you need access."
                />
              ) : tabError ? (
                <>
                  <Notice>{tabError}</Notice>
                  <Button className="secondary" onClick={() => setRefresh((n) => n + 1)}>
                    Try again
                  </Button>
                </>
              ) : !time ? (
                <div role="status" className="detail-loading">
                  Loading {tab.toLowerCase()}…
                </div>
              ) : tab === 'Attendance' ? (
                <DetailAttendance
                  time={time}
                  detail={detail}
                  zone={data.workspace.timeZone}
                  workspaceId={workspaceId}
                  month={month}
                  setMonth={setMonth}
                  reload={reload}
                />
              ) : tab === 'Leaves' ? (
                <DetailLeaves
                  time={time}
                  detail={detail}
                  workspaceId={workspaceId}
                  reload={reload}
                  documents={documents}
                  month={month}
                />
              ) : (
                <DetailDocuments
                  documents={documents}
                  detail={detail}
                  workspaceId={workspaceId}
                  reload={reload}
                />
              )}
            </div>
          </div>
        )}
      </div>
      {edit && detail && (
        <DetailEdit
          detail={detail}
          workspaceId={workspaceId}
          section={edit}
          options={options}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            await reload()
            setEdit(null)
            setNotice('Changes saved.')
          }}
        />
      )}
      {action && detail && (
        <DetailDialog
          title={
            action === 'access'
              ? 'Manage account access'
              : action === 'invite'
                ? 'Send an invitation?'
                : `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${f!.fullName}?`
          }
          description={
            action === 'deactivate'
              ? 'This marks the employee as inactive and removes workspace access. Their records and documents are retained.'
              : action === 'reactivate'
                ? 'This marks the employee as active again. Send a new invitation separately to restore workspace access.'
                : action === 'access'
                  ? 'Update this employee’s workspace access.'
                  : 'Changes apply to this workspace only.'
          }
          onClose={() => setAction(null)}
          busy={busy}
          dirty={action === 'access' && role !== detail.role}
          footer={
            <>
              <Button data-dialog-close className="secondary" disabled={busy}>
                Cancel
              </Button>
              <Button
                className={action === 'deactivate' ? 'danger' : ''}
                busy={busy}
                onClick={() => void perform()}
              >
                {action === 'deactivate'
                  ? 'Deactivate employee'
                  : action === 'reactivate'
                    ? 'Reactivate employee'
                    : action === 'invite'
                      ? 'Send invitation'
                      : 'Save changes'}
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
          {action === 'access' && (
            <SelectField
              label="Workspace access"
              value={role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager / HR' : 'Employee'}
              onChange={(v) =>
                setRole(v === 'Admin' ? 'admin' : v === 'Manager / HR' ? 'manager' : 'employee')
              }
              options={[
                'Employee',
                ...(data.workspace.managersEnabled ? ['Manager / HR'] : []),
                'Admin',
              ]}
              placeholder="Select access"
            />
          )}
        </DetailDialog>
      )}
    </DashboardShell>
  )
}
