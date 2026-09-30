import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Search } from 'lucide-react'
import { Avatar, Button, mediaUrl, Notice } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { ScrollArea } from '../../components/scroll-area'
import { DetailMenu } from '../team/detail-menu'
import { DetailToast } from '../team/detail-toast'
import { api } from '../../lib/api'
import type { AdminLeaves, LeavePolicy, LeaveRequest } from '../../server/leaves'
import { LeaveCalendar } from './leave-calendar'
import { daysText, LeaveStatus, prettyDate, RecordLeave, ReviewLeave } from './leave-dialogs'
import { PolicyForm } from './policy-form'
import '../team/employee-detail.css'
import './leaves.css'

export function LeavesScreen({ workspaceId, admin }: { workspaceId: string; admin: boolean }) {
  const [state, setState] = useState<AdminLeaves | null>(null),
    [load, setLoad] = useState<'loading' | 'error' | 'ready'>('loading'),
    [reload, setReload] = useState(0)
  const [tab, setTab] = useState('Leaves'),
    [search, setSearch] = useState(''),
    [department, setDepartment] = useState('All departments'),
    [type, setType] = useState('All leave types'),
    [sort, setSort] = useState('Newest first')
  const [record, setRecord] = useState(false),
    [request, setRequest] = useState<LeaveRequest | null>(null),
    [policy, setPolicy] = useState<{ kind: LeavePolicy['kind']; value?: LeavePolicy } | null>(null),
    [addPolicy, setAddPolicy] = useState(false)
  const [page, setPage] = useState(1),
    [size, setSize] = useState(15),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const policyAnchor = useRef<HTMLButtonElement>(null)
  const closePolicyMenu = useCallback(() => setAddPolicy(false), [])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!admin) return
    const c = new AbortController(),
      timer = setTimeout(() => c.abort('timeout'), 15000)
    setLoad('loading')
    setError('')
    fetch(`/api/app/leaves?${new URLSearchParams({ workspaceId })}`, { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load leaves.')
        return r.json() as Promise<AdminLeaves>
      })
      .then((s) => {
        if (!c.signal.aborted) {
          setState(s)
          setLoad('ready')
        }
      })
      .catch(() => {
        if (c.signal.reason !== 'unmount') setLoad('error')
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      c.abort('unmount')
    }
  }, [workspaceId, reload, admin])
  async function saved(text: string) {
    setMessage(text)
    try {
      const next = await api<AdminLeaves>(`leaves?${new URLSearchParams({ workspaceId })}`)
      if (mounted.current) {
        setState(next)
        setLoad('ready')
      }
    } catch {
      setError('Saved, but the list could not refresh. Reload to see the latest changes.')
    }
  }
  const dismiss = useCallback(() => setMessage(''), [])
  useEffect(() => setPage(1), [search, department, type, sort, tab, size])
  if (!admin)
    return (
      <div className="leave-empty">
        <h1>Admin access required</h1>
        <p>Manage your own leave from your employee profile.</p>
      </div>
    )
  if (policy && state)
    return (
      <>
        <PolicyForm
          key={policy.value?.id ?? policy.kind}
          policy={policy.value}
          kind={policy.kind}
          state={state}
          workspaceId={workspaceId}
          onClose={() => setPolicy(null)}
          onSaved={saved}
        />
        <DetailToast message={message} onDismiss={dismiss} />
      </>
    )
  const requests = (state?.requests ?? [])
    .filter((r) => {
      const p = state?.people.find((p) => p.id === r.memberId)
      return (
        `${p?.name} ${r.type} ${r.status}`.toLowerCase().includes(search.toLowerCase()) &&
        (department === 'All departments' || p?.department === department) &&
        (type === 'All leave types' || r.type === type)
      )
    })
    .sort((a, b) =>
      sort === 'Oldest first'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : sort === 'Start date'
          ? a.startDate.localeCompare(b.startDate)
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  const policies = (state?.policies ?? [])
    .filter(
      (p) =>
        `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()) &&
        (type === 'All leave types' || type === p.kind) &&
        (department === 'All departments' ||
          !p.rules.departments.length ||
          p.rules.departments.includes(department)),
    )
    .sort(
      (a, b) =>
        (a.kind === 'custom' ? 1 : 0) - (b.kind === 'custom' ? 1 : 0) ||
        (sort === 'Oldest first'
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    )
  const total = tab === 'Request' ? requests.length : policies.length,
    pages = Math.max(1, Math.ceil(total / size)),
    current = Math.min(page, pages)
  const filtered = !!search || department !== 'All departments' || type !== 'All leave types'
  return (
    <div className="leaves-screen" data-tab={tab}>
      <div className="leave-tabs-bar">
        <nav aria-label="Leaves sections">
          {['Leaves', 'Request', 'Leave policy'].map((t, i) => (
            <button
              aria-current={tab === t ? 'page' : undefined}
              key={t}
              onClick={() => {
                setTab(t)
                setSearch('')
                setDepartment('All departments')
                setType('All leave types')
              }}
            >
              <img
                src={
                  ['/dashboard/calendar-off.svg', '/leaves/request.svg', '/leaves/policy.svg'][i]
                }
                width={16}
                height={16}
                alt=""
              />
              {t}
            </button>
          ))}
        </nav>
        <Button
          aria-expanded={tab === 'Leave policy' ? addPolicy : undefined}
          disabled={load !== 'ready'}
          onClick={(event) => {
            policyAnchor.current = event.currentTarget
            tab === 'Leave policy' ? setAddPolicy(!addPolicy) : setRecord(true)
          }}
        >
          <Plus size={16} />
          {tab === 'Leave policy' ? 'Add leave policy' : 'Record time off'}
        </Button>
      </div>
      <Notice>{error}</Notice>
      {tab !== 'Leaves' && (
        <div className="leave-list-toolbar">
          <label className="leave-search">
            <Search size={16} />
            <input
              type="search"
              aria-label={tab === 'Request' ? 'Search requests' : 'Search leave types'}
              placeholder={tab === 'Request' ? 'Search requests' : 'Search leave types'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={160}
            />
          </label>
          <div className="leave-list-filters">
            <SelectField
              compact
              label="Sort"
              placeholder="Sort"
              value={sort}
              options={
                tab === 'Request'
                  ? ['Newest first', 'Oldest first', 'Start date']
                  : ['Newest first', 'Oldest first']
              }
              onChange={setSort}
            />
            <SelectField
              compact
              searchable
              label="Department"
              placeholder="All departments"
              value={department}
              options={[
                'All departments',
                ...new Set(state?.people.map((p) => p.department).filter(Boolean)),
              ]}
              onChange={setDepartment}
            />
            <SelectField
              compact
              label="Leave type"
              placeholder="All leave types"
              value={
                tab === 'Leave policy'
                  ? ({ annual: 'Annual leave', custom: 'Custom leave', closure: 'Mass leave' }[
                      type
                    ] ?? type)
                  : type
              }
              displayValue={
                type === 'annual'
                  ? 'Annual leave'
                  : type === 'custom'
                    ? 'Custom leave'
                    : type === 'closure'
                      ? 'Mass leave'
                      : type
              }
              options={
                tab === 'Request'
                  ? ['All leave types', ...new Set(state?.requests.map((r) => r.type))]
                  : ['All leave types', 'Annual leave', 'Custom leave', 'Mass leave']
              }
              onChange={(v) =>
                setType(
                  tab === 'Leave policy'
                    ? ({
                        'Annual leave': 'annual',
                        'Custom leave': 'custom',
                        'Mass leave': 'closure',
                      }[v] ?? v)
                    : v,
                )
              }
            />
          </div>
        </div>
      )}
      {load === 'loading' ? (
        <div className="leave-loading" role="status" aria-label="Loading leaves">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : load === 'error' ? (
        <div className="leave-empty">
          <img src="/team/error.svg" alt="" />
          <h2>Could not load leaves</h2>
          <p>Something went wrong. Please try again.</p>
          <Button className="secondary" onClick={() => setReload((v) => v + 1)}>
            Try again
          </Button>
        </div>
      ) : state && tab === 'Leaves' ? (
        <LeaveCalendar
          state={state}
          onRequest={setRequest}
          onRequests={() => setTab('Request')}
          onPolicy={(value) => setPolicy({ kind: value.kind, value })}
        />
      ) : (
        <>
          {tab === 'Leave policy' &&
            !state?.policies.some((p) => p.kind === 'annual') &&
            !filtered && (
              <button className="leave-annual-setup" onClick={() => setPolicy({ kind: 'annual' })}>
                <span>
                  <strong>Annual leave</strong>
                  <small>Set the yearly entitlement and request rules.</small>
                </span>
                <span>Configure</span>
              </button>
            )}
          {!total ? (
            <div className="leave-empty">
              <img src={filtered ? '/team/empty.svg' : '/leaves/empty.svg'} alt="" />
              <h2>
                {filtered
                  ? 'No results found'
                  : tab === 'Request'
                    ? 'No leave requests yet'
                    : 'No leave policies yet'}
              </h2>
              <p>
                {filtered
                  ? 'Try another search or clear your filters.'
                  : tab === 'Request'
                    ? 'Review employee requests here, or record time off for your team.'
                    : 'Create a leave policy to get started.'}
              </p>
              {filtered ? (
                <Button
                  className="secondary"
                  onClick={() => {
                    setSearch('')
                    setDepartment('All departments')
                    setType('All leave types')
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  onClick={(event) => {
                    policyAnchor.current = event.currentTarget
                    tab === 'Request' ? setRecord(true) : setAddPolicy(true)
                  }}
                >
                  <Plus size={16} />
                  {tab === 'Request' ? 'Record time off' : 'Add leave policy'}
                </Button>
              )}
            </div>
          ) : (
            <>
              <ScrollArea className="leave-table-area" type="auto">
                <div className="leave-table-horizontal">
                  <table className="leave-table">
                    <colgroup>
                      {(tab === 'Request'
                        ? ['auto', '144px', '144px', '240px', '160px', '142px']
                        : ['auto', '200px', '200px', '184px', '160px', '120px']
                      ).map((width, i) => (
                        <col key={i} style={{ width }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {(tab === 'Request'
                          ? [
                              'Request by',
                              'Requested',
                              'Status',
                              'Start / End date',
                              'Leave type',
                              '',
                            ]
                          : [
                              'Leave types',
                              'Allowance',
                              'Eligibility',
                              'Payroll status',
                              'Status',
                              '',
                            ]
                        ).map((h, i) => (
                          <th key={i}>
                            {h ? (
                              <span>
                                {i < 5 && (
                                  <img
                                    width={16}
                                    height={16}
                                    alt=""
                                    src={
                                      (tab === 'Request'
                                        ? [
                                            '/dashboard/user-group-02.svg',
                                            '/leaves/date.svg',
                                            '/leaves/status.svg',
                                            '/leaves/date.svg',
                                            '/leaves/type.svg',
                                          ]
                                        : [
                                            '/dashboard/user-group-02.svg',
                                            '/team/id.svg',
                                            '/team/employment.svg',
                                            '/leaves/type.svg',
                                            '/leaves/status.svg',
                                          ])[i]
                                    }
                                  />
                                )}{' '}
                                {h}
                              </span>
                            ) : (
                              <span className="sr-only">Actions</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tab === 'Request'
                        ? requests.slice((current - 1) * size, current * size).map((r) => {
                            const p = state!.people.find((p) => p.id === r.memberId)!
                            return (
                              <tr key={r.id}>
                                <td>
                                  <button
                                    className="leave-person leave-person-button"
                                    onClick={() => setRequest(r)}
                                  >
                                    <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
                                    <span>
                                      <strong>{p.name}</strong>
                                      <small>{p.jobTitle || 'Employee'}</small>
                                    </span>
                                  </button>
                                </td>
                                <td>{prettyDate(r.createdAt)}</td>
                                <td>
                                  <LeaveStatus status={r.status} />
                                </td>
                                <td>
                                  <strong>
                                    {prettyDate(r.startDate)} → {prettyDate(r.endDate)}
                                  </strong>
                                  <small>{daysText(r.halfDays / 2)}</small>
                                </td>
                                <td>
                                  <span className="leave-type-tag">{r.type}</span>
                                </td>
                                <td>
                                  <div className="leave-row-actions">
                                    {r.status === 'pending' &&
                                      r.memberId !== state!.viewerMemberId && (
                                        <Button onClick={() => setRequest(r)}>Approve</Button>
                                      )}
                                    <button
                                      className="icon-button"
                                      aria-label={`View request by ${p.name}`}
                                      onClick={() => setRequest(r)}
                                    >
                                      <MoreHorizontal size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        : policies
                            .slice((current - 1) * size, current * size)
                            .map((p, index, list) => (
                              <Fragment key={p.id}>
                                {(index === 0 ||
                                  (p.kind === 'custom') !==
                                    (list[index - 1].kind === 'custom')) && (
                                  <tr className="leave-policy-group">
                                    <td colSpan={6}>
                                      {p.kind === 'custom'
                                        ? 'Custom leave'
                                        : 'Annual and mass leave'}
                                      <span>
                                        {p.kind === 'custom'
                                          ? `${policies.filter((x) => x.kind === 'custom').length} types`
                                          : 'Applies to everyone who qualifies'}
                                      </span>
                                    </td>
                                  </tr>
                                )}
                                <tr>
                                  <td>
                                    <button
                                      className={`leave-policy-name kind-${p.kind}`}
                                      onClick={() => setPolicy({ kind: p.kind, value: p })}
                                    >
                                      <strong>{p.name}</strong>
                                      <small>
                                        {p.kind === 'annual'
                                          ? 'Statutory · yearly balance'
                                          : p.category}
                                      </small>
                                    </button>
                                  </td>
                                  <td>
                                    <strong>
                                      {p.kind === 'closure'
                                        ? `${prettyDate(p.rules.startDate)} → ${prettyDate(p.rules.endDate)}`
                                        : p.rules.unlimited
                                          ? 'Unlimited'
                                          : `${p.rules.days} ${p.rules.countAs.toLowerCase()}`}
                                    </strong>
                                    <small>
                                      {p.kind === 'closure'
                                        ? 'per event'
                                        : p.rules.period.toLowerCase()}
                                    </small>
                                  </td>
                                  <td>
                                    {p.rules.eligibleMonths
                                      ? `${p.rules.eligibleMonths} months of service`
                                      : p.rules.coverage === 'All employees'
                                        ? 'All members'
                                        : p.rules.departments.join(', ') ||
                                          p.rules.employmentTypes.join(', ') ||
                                          p.rules.gender}
                                  </td>
                                  <td>
                                    <span className="leave-payment-tag">{p.rules.payment}</span>
                                  </td>
                                  <td>
                                    <LeaveStatus status={p.active ? 'active' : 'inactive'} />
                                  </td>
                                  <td>
                                    {p.kind === 'annual' ? (
                                      <Button onClick={() => setPolicy({ kind: p.kind, value: p })}>
                                        Configure
                                      </Button>
                                    ) : (
                                      <button
                                        className="icon-button"
                                        aria-label={`Configure ${p.name}`}
                                        onClick={() => setPolicy({ kind: p.kind, value: p })}
                                      >
                                        <MoreHorizontal size={16} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              </Fragment>
                            ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
              <footer className="leave-pagination">
                <span>
                  Viewing{' '}
                  <strong>
                    {(current - 1) * size + 1} to {Math.min(current * size, total)}
                  </strong>{' '}
                  of {total} {total === 1 ? 'item' : 'items'}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Previous page"
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="leave-page-number">{current}</span>
                  <button
                    className="icon-button"
                    aria-label="Next page"
                    disabled={current === pages}
                    onClick={() => setPage(current + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                  <span>Items per page</span>
                  <SelectField
                    compact
                    label="Items per page"
                    placeholder="15"
                    value={String(size)}
                    options={['15', '30', '50']}
                    onChange={(v) => setSize(Number(v))}
                  />
                </div>
              </footer>
            </>
          )}
        </>
      )}
      {record && state && (
        <RecordLeave
          state={state}
          workspaceId={workspaceId}
          onClose={() => setRecord(false)}
          onSaved={saved}
        />
      )}
      {request && state && (
        <ReviewLeave
          key={request.id}
          state={state}
          request={request}
          workspaceId={workspaceId}
          onClose={() => setRequest(null)}
          onSaved={saved}
        />
      )}
      {addPolicy && (
        <DetailMenu
          anchor={policyAnchor.current!}
          onClose={closePolicyMenu}
          label="Add leave policy"
          width={320}
          className="leave-add-menu"
        >
          <div className="leave-policy-choices">
            {(!state?.policies.some((p) => p.kind === 'annual')
              ? [
                  ['annual', 'Annual leave', 'Yearly leave entitlement.'],
                  ['custom', 'Custom leave', 'Leave requested by employees.'],
                  ['closure', 'Mass leave', 'Time off scheduled for the company.'],
                ]
              : [
                  ['custom', 'Custom leave', 'Leave requested by employees.'],
                  ['closure', 'Mass leave', 'Time off scheduled for the company.'],
                ]
            ).map(([kind, title, description]) => (
              <button
                key={kind}
                onClick={() => {
                  setAddPolicy(false)
                  setPolicy({ kind: kind as LeavePolicy['kind'] })
                }}
              >
                <strong>{title}</strong>
                <span>{description}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </DetailMenu>
      )}
      <DetailToast message={message} onDismiss={dismiss} />
    </div>
  )
}
