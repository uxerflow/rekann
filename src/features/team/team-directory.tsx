import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Mail, PinOff, Plus, X } from 'lucide-react'
import type { WorkspaceDetails } from '../../server/workspaces'
import type { DirectoryEmployee } from '../../server/directory'
import { Avatar, Button, mediaUrl, useHydrated } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { roleLabels } from '../../shared/contracts'
import {
  employmentDates,
  employeeName,
  employmentTypes,
  filterEmployees,
  pageNumbers,
  sortOptions,
  type DirectorySort,
} from './directory-model'
import './team-directory.css'

type LoadState = 'loading' | 'ready' | 'error'
const icon = (name: string) => <img src={`/team/${name}.svg`} width="16" height="16" alt="" />
const defaultFilters = {
  search: '',
  department: '',
  type: '',
  sort: 'Default order' as DirectorySort,
}

export function TeamDirectory({ data, onAdd }: { data: WorkspaceDetails; onAdd: () => void }) {
  const hydrated = useHydrated()
  const [people, setPeople] = useState<DirectoryEmployee[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [filters, setFilters] = useState(defaultFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [pinned, setPinned] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const preferences = `rekann:directory:${data.workspace.id}:${data.employee.id}`
  const anchor = useRef<HTMLDivElement>(null)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.workspace.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferences) ?? '{}')
      setView(stored.view === 'grid' ? 'grid' : 'list')
      setPinned(
        Array.isArray(stored.pinned)
          ? stored.pinned.filter((id: unknown) => typeof id === 'string').slice(0, 100)
          : [],
      )
    } catch {
      /* Preferences are optional when browser storage is unavailable. */
    }
  }, [preferences])
  function savePreferences(nextView: 'list' | 'grid', nextPins: string[]) {
    try {
      localStorage.setItem(preferences, JSON.stringify({ view: nextView, pinned: nextPins }))
    } catch {
      /* Browsing still works without storage. */
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15_000)
    setState('loading')
    setPeople([])
    fetch(
      `/api/app/directory?workspaceId=${encodeURIComponent(data.workspace.id)}&includeInactive=${includeInactive ? 1 : 0}`,
      {
        signal: controller.signal,
        credentials: 'same-origin',
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Directory request failed')
        const employees: DirectoryEmployee[] = await response.json()
        if (!controller.signal.aborted) {
          setPeople(employees)
          setState('ready')
        }
      })
      .catch(() => {
        if (controller.signal.reason !== 'unmount') setState('error')
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      window.clearTimeout(timeout)
      controller.abort('unmount')
    }
  }, [data.workspace.id, reload, includeInactive])

  function filter(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }))
    setPage(1)
    setMessage('')
  }
  function clear() {
    setFilters(defaultFilters)
    setPage(1)
    setMessage('')
  }
  function pin(person: DirectoryEmployee) {
    const next = pinned.includes(person.id)
      ? pinned.filter((id) => id !== person.id)
      : [...pinned, person.id]
    setPinned(next)
    savePreferences(view, next)
    setMessage(
      `${employeeName(person)} ${next.includes(person.id) ? 'pinned to the top' : 'unpinned'}.`,
    )
  }
  const departments = [
    ...new Set(people.flatMap((person) => (person.department ? [person.department] : []))),
  ].sort()
  const filtered = filterEmployees(people, filters, pinned)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, totalPages)
  const offset = (current - 1) * pageSize
  const rows = filtered.slice(offset, offset + pageSize)
  const hasFilters = !!(filters.search || filters.department || filters.type)
  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(totalPages, next)))
    anchor.current?.scrollIntoView({ block: 'start' })
  }
  function changeView(next: 'list' | 'grid') {
    setView(next)
    savePreferences(next, pinned)
  }
  const add = data.permissions.invite && (
    <Button className="directory-add" onClick={onAdd}>
      <Plus size={16} aria-hidden="true" />
      Add employee
    </Button>
  )

  return (
    <section
      className="team-directory"
      data-view={view}
      data-state={state}
      data-no-results={state === 'ready' && people.length > 0 && filtered.length === 0}
      data-empty={state === 'ready' && people.length === 0}
      aria-label="Team directory"
    >
      <h1 className="sr-only">Team directory</h1>
      <div className="directory-toolbar">
        <div className="directory-views" role="group" aria-label="Directory view">
          <button aria-pressed={view === 'list'} onClick={() => changeView('list')}>
            {icon('list')}List View
          </button>
          <button aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>
            {icon('grid')}Grid View
          </button>
        </div>
        {add}
      </div>
      <div className="directory-filters" ref={anchor}>
        <div className="directory-filter-controls">
          <SelectField
            compact
            label="Sort employees"
            placeholder="Sort"
            value={filters.sort}
            options={sortOptions}
            onChange={(value) => filter('sort', value)}
            prefix={icon('sort')}
            displayValue="Sort"
            menuWidth={216}
          />
          <span className="directory-divider" />
          <SelectField
            compact
            label="Department"
            placeholder="All departments"
            value={filters.department || 'All departments'}
            options={['All departments', ...departments]}
            onChange={(value) => filter('department', value === 'All departments' ? '' : value)}
            prefix={
              <>
                {icon('department')}
                <span className="directory-filter-label">Dept.</span>
              </>
            }
            displayValue={filters.department || 'All'}
            menuWidth={216}
          />
          <SelectField
            compact
            label="Employment type"
            placeholder="All types"
            value={filters.type || 'All types'}
            options={['All types', ...employmentTypes]}
            onChange={(value) => filter('type', value === 'All types' ? '' : value)}
            prefix={
              <>
                {icon('type')}
                <span className="directory-filter-label">Type</span>
              </>
            }
            displayValue={filters.type || 'All'}
            menuWidth={160}
          />
          {data.employee.role === 'admin' && (
            <label className="directory-inactive-toggle">
              <input
                type="checkbox"
                disabled={!hydrated}
                checked={includeInactive}
                onChange={(e) => {
                  setIncludeInactive(e.target.checked)
                  setPage(1)
                }}
              />
              Show inactive
            </label>
          )}
          {hasFilters && (
            <button className="directory-clear text-button" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
        <div className="directory-search">
          {icon('search')}
          <input
            aria-label="Search employees"
            placeholder="Search by name, email or ID..."
            value={filters.search}
            maxLength={100}
            onChange={(event) => filter('search', event.target.value)}
          />
          {filters.search && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => filter('search', '')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {message || (state === 'ready' ? `${filtered.length} employees found` : '')}
      </p>
      <div className={`directory-content directory-${view}`} aria-busy={state === 'loading'}>
        {view === 'list' && (
          <div
            className="directory-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Employee list"
          >
            <table className="directory-table">
              <colgroup>
                {[28, 10.6667, 16.6667, 10, 13.3333, 15.3333, 6].map((width, i) => (
                  <col key={i} style={{ width: `${width}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[
                    ['employee', 'Employee'],
                    ['id', 'ID'],
                    ['position', 'Position'],
                    ['employment', 'Type'],
                    ['access', 'Access'],
                    ['joined', 'Joined'],
                  ].map(([glyph, label]) => (
                    <th scope="col" key={label}>
                      <span>
                        {icon(glyph)}
                        {label}
                      </span>
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state === 'loading'
                  ? Array.from({ length: 10 }, (_, i) => (
                      <tr key={i} className="directory-skeleton-row">
                        {Array.from({ length: 7 }, (_, j) => (
                          <td key={j}>
                            <span className="directory-skeleton" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : state === 'ready' &&
                    rows.map((person) => {
                      const dates = employmentDates(person.startDate, today)
                      return (
                        <tr key={person.id}>
                          <td>
                            <div className="directory-person">
                              <Avatar
                                name={employeeName(person)}
                                image={mediaUrl(person.avatarKey)}
                              />
                              <div>
                                <strong title={employeeName(person)}>
                                  {person.recordId ? (
                                    <a
                                      href={`/w/${data.workspace.slug}/team/records/${person.recordId}`}
                                    >
                                      {employeeName(person)}
                                    </a>
                                  ) : (
                                    employeeName(person)
                                  )}
                                </strong>
                                <span title={person.email}>{person.email}</span>
                              </div>
                              {pinned.includes(person.id) && (
                                <img
                                  className="directory-pin-mark"
                                  src="/team/pin.svg"
                                  width="16"
                                  height="16"
                                  alt="Pinned"
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <span className="directory-id">
                              {person.employeeNumber || 'Not assigned'}
                            </span>
                          </td>
                          <td>
                            <strong title={person.jobTitle}>{person.jobTitle || 'Not set'}</strong>
                            {person.department && (
                              <span className="directory-secondary" title={person.department}>
                                {person.department}
                              </span>
                            )}
                          </td>
                          <td>
                            <EmploymentBadge type={person.employmentType} />
                          </td>
                          <td>
                            <span className={`directory-badge role-${person.role}`}>
                              {person.status === 'removed' ? 'Inactive' : roleLabels[person.role]}
                            </span>
                          </td>
                          <td>
                            <strong>{dates.date}</strong>
                            {dates.tenure && (
                              <span className="directory-secondary">{dates.tenure}</span>
                            )}
                          </td>
                          <td>
                            <PinAction
                              person={person}
                              pinned={pinned.includes(person.id)}
                              onPin={() => pin(person)}
                            />
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        )}
        {view === 'grid' && state === 'loading' && (
          <div className="directory-cards">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="directory-card directory-skeleton" key={i} />
            ))}
          </div>
        )}
        {state === 'loading' && (
          <p role="status" aria-label="Loading employees" className="sr-only">
            Loading employees…
          </p>
        )}
        {view === 'grid' && state === 'ready' && rows.length > 0 && (
          <div className="directory-cards">
            {rows.map((person) => (
              <article key={person.id} className="directory-card">
                <Avatar name={employeeName(person)} image={mediaUrl(person.avatarKey)} />
                <div className="directory-card-copy">
                  <h2 title={employeeName(person)}>
                    {person.recordId ? (
                      <a href={`/w/${data.workspace.slug}/team/records/${person.recordId}`}>
                        {employeeName(person)}
                      </a>
                    ) : (
                      employeeName(person)
                    )}
                  </h2>
                  <p title={[person.jobTitle, person.department].filter(Boolean).join(' | ')}>
                    {[person.jobTitle, person.department].filter(Boolean).join(' | ') || 'Not set'}
                  </p>
                  <a
                    className="directory-card-email"
                    href={`mailto:${person.email}`}
                    title={person.email}
                  >
                    <Mail size={14} aria-hidden="true" />
                    <span>{person.email}</span>
                  </a>
                  <div className="directory-badges">
                    <EmploymentBadge type={person.employmentType} />
                    <span className={`directory-badge role-${person.role}`}>
                      {person.status === 'removed' ? 'Inactive' : roleLabels[person.role]}
                    </span>
                  </div>
                </div>
                <div
                  className={`directory-card-action ${pinned.includes(person.id) ? 'is-pinned' : ''}`}
                >
                  <PinAction
                    person={person}
                    pinned={pinned.includes(person.id)}
                    onPin={() => pin(person)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
        {state === 'error' && (
          <div className="directory-state" role="alert">
            <div>
              <img
                className="directory-state-art"
                src="/team/error.svg"
                width="48"
                height="48"
                alt=""
              />
              <h2>Employees could not be loaded</h2>
              <p>Check your connection and try again. Your employee data has not changed.</p>
              <Button onClick={() => setReload((value) => value + 1)}>Try again</Button>
            </div>
          </div>
        )}
        {state === 'ready' && !filtered.length && (
          <div className="directory-state">
            <div>
              {!hasFilters && (
                <img
                  className="directory-state-art"
                  src="/team/empty.svg"
                  width="48"
                  height="48"
                  alt=""
                />
              )}
              <h2>{hasFilters ? 'No employees found' : 'Your team starts here'}</h2>
              <p>
                {hasFilters
                  ? 'Try a different search or clear your filters.'
                  : 'Add your first employee to manage work details, attendance and documents in one place.'}
              </p>
              {hasFilters ? (
                <Button onClick={clear}>Clear search and filters</Button>
              ) : (
                data.permissions.invite && <Button onClick={onAdd}>Add employee</Button>
              )}
            </div>
          </div>
        )}
      </div>
      {state === 'ready' && filtered.length > 0 && (
        <footer className="directory-pagination">
          <p>
            Viewing{' '}
            <strong>
              {offset + 1} to {Math.min(offset + pageSize, filtered.length)}
            </strong>{' '}
            of {filtered.length} {filtered.length === 1 ? 'employee' : 'employees'}
          </p>
          <nav aria-label="Employee pages">
            <button
              aria-label="Previous page"
              disabled={current === 1}
              onClick={() => changePage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {pageNumbers(current, totalPages).map((number, index) =>
              number === 'gap' ? (
                <span key={`gap-${index}`} className="directory-page-gap">
                  …
                </span>
              ) : (
                <button
                  key={number}
                  aria-label={`Page ${number}`}
                  aria-current={current === number ? 'page' : undefined}
                  onClick={() => changePage(number)}
                >
                  {number}
                </button>
              ),
            )}
            <button
              aria-label="Next page"
              disabled={current === totalPages}
              onClick={() => changePage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
          <div className="directory-page-size">
            <span>Items per page</span>
            <SelectField
              compact
              label="Items per page"
              placeholder="15"
              value={String(pageSize)}
              options={['15', '30', '50']}
              onChange={(value) => {
                setPageSize(Number(value))
                setPage(1)
              }}
              menuWidth={100}
            />
          </div>
        </footer>
      )}
    </section>
  )
}
function EmploymentBadge({ type }: { type: DirectoryEmployee['employmentType'] }) {
  return type ? (
    <span className={`directory-badge type-${type.toLowerCase()}`}>{type}</span>
  ) : (
    <span className="directory-badge directory-badge-unset">Not set</span>
  )
}
function PinAction({
  person,
  pinned,
  onPin,
}: {
  person: DirectoryEmployee
  pinned: boolean
  onPin: () => void
}) {
  const id = useId()
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const label = `${pinned ? 'Unpin' : 'Pin'} ${employeeName(person)}`
  return (
    <>
      <button
        ref={trigger}
        className="icon-button"
        aria-label={`Actions for ${employeeName(person)}`}
        popoverTarget={id}
        onClick={() => {
          const rect = trigger.current!.getBoundingClientRect()
          setPosition({
            left: Math.max(8, rect.right - 192),
            top: Math.min(rect.bottom + 4, window.innerHeight - 64),
          })
        }}
      >
        {pinned ? icon('pin') : icon('more')}
      </button>
      <div ref={menu} id={id} popover="auto" className="directory-action-popover" style={position}>
        <button
          aria-label={label}
          onClick={() => {
            onPin()
            menu.current?.hidePopover()
            trigger.current?.focus()
          }}
        >
          {pinned ? <PinOff size={16} /> : icon('pin')}
          {pinned ? 'Unpin employee' : 'Pin employee'}
        </button>
      </div>
    </>
  )
}
