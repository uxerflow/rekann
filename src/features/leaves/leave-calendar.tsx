import { useState, useCallback } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { Avatar, Button, mediaUrl } from '../../components/ui'
import { DatePicker } from '../../components/date-picker'
import { SelectField } from '../../components/select-field'
import { ScrollArea } from '../../components/scroll-area'
import { DetailMenu } from '../team/detail-menu'
import { DetailDialog } from '../team/detail-dialog'
import { dayInZone } from '../../shared/employee-detail'
import { addDays, dateDays } from '../../shared/leaves'
import type { AdminLeaves, LeavePolicy, LeaveRequest } from '../../server/leaves'
import { daysText, prettyDate } from './leave-dialogs'

const monthName = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(date),
  )
const monday = (date: string) => addDays(date, -((new Date(date).getUTCDay() + 6) % 7))
const tone = (name: string) =>
  /unpaid/i.test(name)
    ? 'red'
    : /sick|medical/i.test(name)
      ? 'gray'
      : /patern|parental/i.test(name)
        ? 'blue'
        : /matern|closure|holiday/i.test(name)
          ? 'orange'
          : 'purple'
type CalendarEvent = {
  id: string
  name: string
  start: string
  end: string
  memberId?: string
  pending: boolean
  request?: LeaveRequest
  countAs: string
  policy?: LeavePolicy
  coveredIds?: string[]
}
export function LeaveCalendar({
  state,
  onRequest,
  onRequests,
  onPolicy,
}: {
  state: AdminLeaves
  onRequest: (r: LeaveRequest) => void
  onRequests: () => void
  onPolicy: (policy: LeavePolicy) => void
}) {
  const [mode, setMode] = useState('Week'),
    [date, setDate] = useState(state.today),
    [sidebar, setSidebar] = useState(true),
    [day, setDay] = useState<string | null>(null),
    [event, setEvent] = useState<CalendarEvent | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [summary, setSummary] = useState<{
    kind: string
    events: CalendarEvent[]
    date?: string
  } | null>(null)
  const closeEvent = useCallback(() => {
    setEvent(null)
    setSummary(null)
  }, [])
  const events: CalendarEvent[] = [
    ...state.requests
      .filter((r) => ['approved', 'pending'].includes(r.status))
      .map((r) => ({
        id: r.id,
        name: r.type,
        start: r.startDate,
        end: r.endDate,
        memberId: r.memberId,
        pending: r.status === 'pending',
        request: r,
        countAs: r.policyRules?.countAs || 'Working days',
      })),
    ...state.policies
      .filter((p) => p.kind === 'closure' && p.active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        start: p.rules.startDate,
        end: p.rules.endDate,
        pending: false,
        countAs: p.rules.countAs,
        coveredIds: p.coveredMemberIds,
        policy: p,
      })),
  ]
  const pending = state.requests.filter((r) => r.status === 'pending')
  const at = (d: string) =>
    events.filter(
      (e) => e.start <= d && e.end >= d && dateDays(e.start, e.end, e.countAs).includes(d),
    )
  function navigate(delta: number) {
    if (mode === 'Week') {
      setDate(addDays(date, delta * 7))
      return
    }
    const d = new Date(date)
    d.setUTCDate(1)
    if (mode === 'Month') d.setUTCMonth(d.getUTCMonth() + delta)
    else d.setUTCFullYear(d.getUTCFullYear() + delta)
    setDate(d.toISOString().slice(0, 10))
  }
  function chip(e: CalendarEvent, compact = false) {
    const p = state.people.find((p) => p.id === e.memberId)
    const icon = /unpaid/i.test(e.name)
      ? 'unpaid'
      : /sick|medical/i.test(e.name)
        ? 'sick'
        : /patern|parental/i.test(e.name)
          ? 'paternal'
          : /matern/i.test(e.name)
            ? 'maternity'
            : /annual/i.test(e.name)
              ? 'annual'
              : null
    return (
      <button
        type="button"
        className={`leave-chip tone-${tone(e.name)} ${e.pending ? 'leave-pending' : ''}`}
        aria-label={`${p?.name || 'Company'} · ${e.name}${e.pending ? ' · Pending' : ''}`}
        title={`${e.name} · ${p?.name || 'Company'} · ${prettyDate(e.start)}${e.end !== e.start ? ` – ${prettyDate(e.end)}` : ''}`}
        onClick={(click) => {
          setSummary(null)
          setAnchor(click.currentTarget)
          setEvent(e)
        }}
      >
        {compact && p ? (
          <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
        ) : icon ? (
          <img
            className="leave-chip-icon"
            src={`/leaves/${icon}.svg`}
            width={16}
            height={16}
            alt=""
          />
        ) : (
          <CalendarDays
            className="leave-chip-icon"
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
        <span>{e.name}</span>
      </button>
    )
  }
  function monthGrid(month: string, mini = false) {
    const first = `${month.slice(0, 7)}-01`,
      start = monday(first),
      last = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10)
    const count =
      Math.ceil((Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1) / 7) * 7
    const days = Array.from({ length: count }, (_, i) => addDays(start, i))
    if (mini)
      return (
        <div className="leave-mini-days">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((v, i) => (
            <span key={i}>{v}</span>
          ))}
          {days.map((d) => (
            <button
              key={d}
              className={[0, 6].includes(new Date(d).getUTCDay()) ? 'weekend' : ''}
              disabled={!d.startsWith(month.slice(0, 7))}
              aria-label={`${prettyDate(d)}, ${at(d).length} events`}
              title={`${prettyDate(d)} · ${at(d).length ? 'View leave and closure details' : 'No leave or closures'}`}
              onClick={(click) => {
                setEvent(null)
                setAnchor(click.currentTarget)
                setSummary({ kind: 'day', events: at(d), date: d })
              }}
            >
              {d.startsWith(month.slice(0, 7)) && (
                <>
                  <time className={d === state.today ? 'is-today' : ''}>{Number(d.slice(8))}</time>
                  <span className="leave-mini-dots" aria-hidden="true">
                    {at(d).some((e) => e.request && !e.pending) && <i className="approved" />}
                    {at(d).some((e) => !e.request) && <i className="closure" />}
                    {at(d).some((e) => e.pending) && <i className="pending" />}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )
    return (
      <div className="leave-month">
        <div className="leave-weekdays">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
            (v) => (
              <span key={v}>{v}</span>
            ),
          )}
        </div>
        {Array.from({ length: count / 7 }, (_, i) => {
          const week = days.slice(i * 7, i * 7 + 7)
          const items = events.filter((e) => e.start <= week[6] && e.end >= week[0])
          const lanes: string[][] = []
          const segments: { e: CalendarEvent; start: number; end: number; lane: number }[] = []
          for (const e of items) {
            let index = 0
            while (index < 7) {
              if (!at(week[index]).some((x) => x.id === e.id)) {
                index++
                continue
              }
              const from = index
              while (index < 6 && at(week[index + 1]).some((x) => x.id === e.id)) index++
              const to = index
              let lane = 0
              while (lanes[lane]?.slice(from, to + 1).some(Boolean)) lane++
              lanes[lane] ??= Array(7).fill('')
              for (let d = from; d <= to; d++) lanes[lane][d] = e.id
              segments.push({ e, start: from, end: to, lane })
              index++
            }
          }
          return (
            <div className="leave-month-week" key={week[0]}>
              {week.map((d) => (
                <button
                  key={d}
                  className={`leave-day-cell ${d.slice(0, 7) !== month.slice(0, 7) ? 'outside-month' : ''}`}
                  aria-label={`View leaves on ${prettyDate(d)}`}
                  onClick={() => setDay(d)}
                >
                  <time className={d === state.today ? 'is-today' : ''}>{Number(d.slice(8))}</time>
                </button>
              ))}
              <div className="leave-month-events">
                {segments
                  .filter((s) => s.lane < 2)
                  .map((s) => (
                    <div
                      key={`${s.e.id}-${s.start}`}
                      style={{ gridColumn: `${s.start + 1} / ${s.end + 2}`, gridRow: s.lane + 1 }}
                    >
                      {chip(s.e, true)}
                    </div>
                  ))}
                {week.map((d, idx) => {
                  const hidden = segments.filter(
                    (s) => s.lane >= 2 && s.start <= idx && s.end >= idx,
                  ).length
                  return hidden ? (
                    <button
                      className="leave-more"
                      key={d}
                      style={{ gridColumn: idx + 1, gridRow: 3 }}
                      onClick={() => setDay(d)}
                    >
                      +{hidden} more
                    </button>
                  ) : null
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  const weekStart = monday(date),
    weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const activePeople = state.people.filter((person) => person.active)
  const visibleWeekEvents = events.filter(
    (event) =>
      event.start <= weekDays[6] &&
      event.end >= weekStart &&
      activePeople.some(
        (person) => person.id === event.memberId || event.coveredIds?.includes(person.id),
      ),
  )
  return (
    <div className={`leave-calendar-layout ${sidebar ? '' : 'pending-hidden'}`}>
      <section className="leave-calendar-main">
        <div className="leave-calendar-toolbar">
          <strong>{mode === 'Year' ? date.slice(0, 4) : monthName(date)}</strong>
          <div>
            <button
              className="icon-button"
              aria-label={`Previous ${mode.toLowerCase()}`}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Next ${mode.toLowerCase()}`}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </button>
            <DatePicker
              label="Calendar date"
              compact
              value={date}
              today={state.today}
              mode={mode.toLowerCase() as 'week' | 'month' | 'year'}
              onChange={setDate}
            />
            <SelectField
              compact
              required={false}
              label="Calendar view"
              placeholder="Week"
              value={mode}
              options={['Week', 'Month', 'Year']}
              onChange={setMode}
            />
            {!sidebar && (
              <button
                className="icon-button"
                aria-label="Show pending requests"
                onClick={() => setSidebar(true)}
              >
                <PanelRightOpen size={16} />
              </button>
            )}
            <Button
              className="secondary leave-today-button"
              onClick={() => setDate(state.today)}
              title="Go to today"
            >
              Today
            </Button>
          </div>
        </div>
        <ScrollArea className="leave-calendar-scroll" type="auto">
          {mode === 'Week' ? (
            <div className="leave-timeline-scroll">
              <div className="leave-timeline">
                <div className="leave-people-background" aria-hidden="true" />
                <div className="leave-timeline-background" aria-hidden="true">
                  {weekDays.map((d) => (
                    <div
                      key={d}
                      className={`leave-track-day ${[0, 6].includes(new Date(d).getUTCDay()) ? 'weekend' : ''} ${d === state.today ? 'today-column' : ''}`}
                    />
                  ))}
                </div>
                <div className="leave-timeline-header">
                  <span>People</span>
                  <div>
                    <small>{monthName(date)}</small>
                    <div className="leave-timeline-dates">
                      {weekDays.map((d) => (
                        <button
                          className={`${d === state.today ? 'is-today' : ''} ${[0, 6].includes(new Date(d).getUTCDay()) ? 'weekend' : ''}`}
                          key={d}
                          aria-label={prettyDate(d)}
                          onClick={() => setDay(d)}
                        >
                          {Number(d.slice(8))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="leave-timeline-body">
                  {activePeople.map((p) => (
                    <div className="leave-timeline-row" key={p.id}>
                      <div className="leave-person">
                        <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
                        <div>
                          <strong>{p.name}</strong>
                          <span>{p.jobTitle || 'Employee'}</span>
                        </div>
                      </div>
                      <div className="leave-timeline-track">
                        {visibleWeekEvents
                          .filter((e) => e.memberId === p.id || e.coveredIds?.includes(p.id))
                          .map((e) => {
                            const start = Math.max(
                                0,
                                Math.round(
                                  (Date.parse(e.start) - Date.parse(weekStart)) / 86400000,
                                ),
                              ),
                              end = Math.min(
                                6,
                                Math.round((Date.parse(e.end) - Date.parse(weekStart)) / 86400000),
                              )
                            return (
                              <div
                                className="leave-timeline-event"
                                key={e.id}
                                style={{
                                  left: `calc(${(start / 7) * 100}% + 4px)`,
                                  width: `calc(${((end - start + 1) / 7) * 100}% - 8px)`,
                                }}
                              >
                                {chip(e)}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  ))}
                </div>
                {!visibleWeekEvents.length && (
                  <div className="leave-calendar-empty-area">
                    <div className="leave-calendar-empty">
                      <img src="/leaves/week-empty.svg" width={48} height={48} alt="" />
                      <div>
                        <h3>No leave this week</h3>
                        <p>Everyone is available for the selected dates.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : mode === 'Month' ? (
            monthGrid(date)
          ) : (
            <div className="leave-year">
              {Array.from({ length: 12 }, (_, i) => {
                const m = `${date.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`
                const monthEvents = events.filter(
                  (e) => e.start <= `${m.slice(0, 7)}-31` && e.end >= m,
                )
                const groups = [
                  {
                    kind: 'approved',
                    count: monthEvents.filter((e) => e.request && !e.pending).length,
                    label: 'leave',
                    plural: 'leaves',
                  },
                  {
                    kind: 'closure',
                    count: monthEvents.filter((e) => !e.request).length,
                    label: 'company closure',
                    plural: 'company closures',
                  },
                  {
                    kind: 'pending',
                    count: monthEvents.filter((e) => e.pending).length,
                    label: 'needs approval',
                    plural: 'need approval',
                  },
                ]
                return (
                  <section className="leave-mini-month" key={m}>
                    <button
                      className="text-button"
                      onClick={() => {
                        setDate(m)
                        setMode('Month')
                      }}
                    >
                      {monthName(m).split(' ')[0]}
                    </button>
                    {monthGrid(m, true)}
                    <div className="leave-year-summary">
                      {monthEvents.length
                        ? groups
                            .filter((g) => g.count)
                            .map((g) => (
                              <button
                                key={g.kind}
                                className={`leave-year-badge ${g.kind}`}
                                onClick={(e) => {
                                  setEvent(null)
                                  setAnchor(e.currentTarget)
                                  setSummary({
                                    kind: g.kind,
                                    events: monthEvents.filter((item) =>
                                      g.kind === 'pending'
                                        ? item.pending
                                        : g.kind === 'closure'
                                          ? !item.request
                                          : !!item.request && !item.pending,
                                    ),
                                  })
                                }}
                              >
                                {g.count} {g.count === 1 ? g.label : g.plural}
                              </button>
                            ))
                        : 'No events'}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </section>
      {sidebar && (
        <aside className="leave-pending-panel">
          <header>
            <span>Pending Request</span>
            <button
              className="icon-button"
              aria-label="Hide pending requests"
              onClick={() => setSidebar(false)}
            >
              <PanelRightClose size={16} />
            </button>
          </header>
          <ScrollArea className="leave-pending-scroll" type="auto">
            <div className={`leave-pending-list ${!pending.length ? 'is-empty' : ''}`}>
              {!pending.length ? (
                <div className="leave-pending-empty">
                  <h3>All caught up</h3>
                  <p>There are no requests waiting for review.</p>
                </div>
              ) : (
                <>
                  {['Today', 'Earlier'].map((group) => {
                    const rows = pending.filter(
                      (r) =>
                        (dayInZone(new Date(r.createdAt), state.timeZone) === state.today) ===
                        (group === 'Today'),
                    )
                    return rows.length ? (
                      <section key={group}>
                        <h3>{group}</h3>
                        {rows.map((r) => {
                          const p = state.people.find((p) => p.id === r.memberId)!
                          return (
                            <button
                              className="leave-pending-card"
                              key={r.id}
                              onClick={() => onRequest(r)}
                            >
                              <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
                              <span>
                                <strong>{p.name}</strong>
                                <small>
                                  {r.type} · {daysText(r.halfDays / 2)}
                                </small>
                              </span>
                            </button>
                          )
                        })}
                      </section>
                    ) : null
                  })}
                  <Button className="secondary" onClick={onRequests}>
                    See detail request
                  </Button>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      )}
      {day && (
        <DetailDialog title={prettyDate(day)} onClose={() => setDay(null)}>
          <div className="leave-day-list">
            {at(day).length ? (
              at(day).map((e) => <div key={e.id}>{chip(e, true)}</div>)
            ) : (
              <p>No leave on this day.</p>
            )}
          </div>
        </DetailDialog>
      )}
      {event && anchor && (
        <DetailMenu
          anchor={anchor}
          onClose={closeEvent}
          label={event.name}
          width={320}
          className="leave-event-popover"
        >
          <div className="leave-popover-identity">
            <div className="leave-popover-person">
              <strong>
                {event.request
                  ? state.people.find((person) => person.id === event.memberId)?.name || 'Employee'
                  : 'Company closure'}
              </strong>
              <span className={`leave-popover-status ${event.pending ? 'pending' : 'approved'}`}>
                {event.pending ? 'Pending' : event.request ? 'Approved' : 'Active'}
              </span>
            </div>
            <div className="leave-popover-kind">
              <i
                className={`leave-popover-type ${event.policy ? 'closure' : tone(event.name)}`}
                aria-hidden="true"
              />
              <span>{event.name}</span>
            </div>
          </div>
          <div className="leave-popover-divider" />
          <dl className="leave-popover-details">
            <div>
              <dt>Dates</dt>
              <dd>
                {new Intl.DateTimeFormat('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).formatRange(new Date(event.start), new Date(event.end))}
              </dd>
            </div>
            <div>
              <dt>{event.request ? 'Duration' : 'Applies to'}</dt>
              <dd>
                {event.request
                  ? `${event.request.halfDays / 2} ${event.countAs === 'Working days' ? 'working ' : 'calendar '}${event.request.halfDays === 2 ? 'day' : 'days'}`
                  : event.policy?.rules.coverage === 'All employees'
                    ? 'All employees'
                    : `${event.coveredIds?.length ?? 0} employees`}
              </dd>
            </div>
          </dl>
          <Button
            type="button"
            className={event.pending ? '' : 'secondary'}
            onClick={() => {
              closeEvent()
              setDay(null)
              if (event.request) onRequest(event.request)
              else if (event.policy) onPolicy(event.policy)
            }}
          >
            {event.pending ? 'Review request' : event.request ? 'View request' : 'View policy'}
          </Button>
        </DetailMenu>
      )}
      {summary && anchor && (
        <DetailMenu
          anchor={anchor}
          onClose={closeEvent}
          width={320}
          label={
            summary.date
              ? prettyDate(summary.date)
              : summary.kind === 'closure'
                ? 'Company closures'
                : summary.kind === 'pending'
                  ? 'Pending approval'
                  : 'Approved leave'
          }
          className="leave-summary-popover"
        >
          <span className="leave-popover-heading">
            {summary.date
              ? prettyDate(summary.date)
              : summary.kind === 'closure'
                ? 'Company closures'
                : summary.kind === 'pending'
                  ? 'Pending approval'
                  : 'Approved leave'}
          </span>
          <ScrollArea className="leave-summary-scroll" type="auto">
            {!summary.events.length && (
              <p className="leave-summary-empty">No leave or closures on this day.</p>
            )}
            {summary.events.map((item) => {
              const short = (date: string) =>
                new Intl.DateTimeFormat('en', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(date))
              const dates =
                item.start === item.end
                  ? short(item.start)
                  : `${short(item.start)} – ${item.start.slice(0, 7) === item.end.slice(0, 7) ? Number(item.end.slice(8)) : short(item.end)}`
              return (
                <button
                  type="button"
                  className={`leave-summary-row ${item.pending ? 'pending' : item.request ? 'approved' : 'closure'}`}
                  key={item.id}
                  aria-label={`${item.memberId ? state.people.find((person) => person.id === item.memberId)?.name + ' · ' : ''}${item.name} · ${item.pending ? 'Pending approval' : item.request ? 'Approved leave' : 'Company closure'}`}
                  onClick={() => {
                    closeEvent()
                    if (item.request) onRequest(item.request)
                    else setEvent(item)
                  }}
                >
                  <span className="leave-summary-date">
                    <i />
                    {dates}
                  </span>
                  <span>
                    {item.memberId && (
                      <>
                        {state.people.find((p) => p.id === item.memberId)?.name}
                        <span className="leave-summary-dot"> · </span>
                      </>
                    )}
                    <span className={`leave-popover-type ${tone(item.name)}`}>{item.name}</span>
                  </span>
                </button>
              )
            })}
          </ScrollArea>
        </DetailMenu>
      )}
    </div>
  )
}
