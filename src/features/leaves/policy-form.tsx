import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button, Field, Notice } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { DetailDialog } from '../team/detail-dialog'
import { api, messageOf } from '../../lib/api'
import type { AdminLeaves, LeavePolicy } from '../../server/leaves'
import {
  categories,
  closureReasons,
  dateDays,
  defaultPolicy,
  eligible,
  employmentOptions,
  savePolicyInput,
  type PolicyDraft,
  type PolicyRules,
} from '../../shared/leaves'
import { daysText, prettyDate } from './leave-dialogs'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="policy-section">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="policy-fields">{children}</div>
    </section>
  )
}
function Radio({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  return (
    <fieldset className="policy-radio">
      <legend>{label}</legend>
      <div>
        {options.map((o) => (
          <label key={o} data-checked={value === o}>
            <input type="radio" name={label} checked={value === o} onChange={() => onChange(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="policy-toggle">
      <span>{label}</span>
      <span className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span />
      </span>
    </label>
  )
}
function CountSelect({
  label,
  value,
  choices,
  onChange,
  unit = '',
  zero = 'No limit',
  max = 366,
}: {
  label: string
  value: number
  choices: number[]
  onChange: (value: number) => void
  unit?: string
  zero?: string
  max?: number
}) {
  const [custom, setCustom] = useState(!choices.includes(value))
  const text = (n: number) => (n === 0 ? zero : `${n}${unit ? ` ${unit}` : ''}`)
  return (
    <div className="policy-count-select">
      <SelectField
        label={label}
        placeholder="Select an option"
        value={custom ? 'Custom' : text(value)}
        options={[...choices.map(text), 'Custom']}
        onChange={(v) => {
          setCustom(v === 'Custom')
          if (v !== 'Custom') onChange(choices.find((n) => text(n) === v)!)
        }}
      />
      {custom && (
        <Field
          label={`Custom ${label.toLowerCase()}`}
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  )
}
function RequestLimit({
  rules,
  onChange,
}: {
  rules: PolicyRules
  onChange: (count: number, period: PolicyRules['requestPeriod']) => void
}) {
  const choices = [
    ['No limit', 0, 'Per month'],
    ['1 per month', 1, 'Per month'],
    ['2 per month', 2, 'Per month'],
    ['3 per month', 3, 'Per month'],
    ['1 per quarter', 1, 'Per quarter'],
  ] as const
  const selected = choices.find(
    (c) => c[1] === rules.maxRequests && (c[1] === 0 || c[2] === rules.requestPeriod),
  )
  const [custom, setCustom] = useState(!selected)
  return (
    <div className="policy-count-select">
      <SelectField
        label="Maximum requests"
        required={false}
        placeholder="No limit"
        value={custom ? 'Custom' : (selected?.[0] ?? 'Custom')}
        options={[...choices.map((c) => c[0]), 'Custom']}
        onChange={(v) => {
          setCustom(v === 'Custom')
          const c = choices.find((c) => c[0] === v)
          if (c) onChange(c[1], c[2])
        }}
      />
      {custom && (
        <>
          <Field
            label="Maximum number of requests"
            type="number"
            min={1}
            max={366}
            value={rules.maxRequests}
            onChange={(e) => onChange(Number(e.target.value), rules.requestPeriod)}
          />
          <SelectField
            label="Request period"
            placeholder="Per month"
            value={rules.requestPeriod}
            options={['Per month', 'Per quarter']}
            onChange={(v) => onChange(rules.maxRequests, v as PolicyRules['requestPeriod'])}
          />
        </>
      )}
    </div>
  )
}
export function PolicyForm({
  policy,
  kind,
  state,
  workspaceId,
  onClose,
  onSaved,
}: {
  policy?: LeavePolicy
  kind: PolicyDraft['kind']
  state: AdminLeaves
  workspaceId: string
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<PolicyDraft>(() => ({
    workspaceId,
    id: policy?.id ?? crypto.randomUUID(),
    version: policy?.version ?? 0,
    kind,
    name: policy?.name ?? (kind === 'annual' ? 'Annual leave' : ''),
    category: policy?.category ?? '',
    description: policy?.description ?? '',
    active: policy?.active ?? true,
    rules: policy?.rules ?? { ...defaultPolicy(kind), ...(kind === 'custom' ? { days: 0 } : {}) },
  }))
  const [initial] = useState(() => JSON.stringify(draft)),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [discard, setDiscard] = useState(false),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(true)
  const r = draft.rules,
    annual = kind === 'annual',
    closure = kind === 'closure',
    dirty = initial !== JSON.stringify(draft)
  const covered = state.people.filter((p) =>
    eligible(p, r, closure ? r.startDate || state.today : state.today),
  )
  const departments = [...new Set(state.people.map((p) => p.department).filter(Boolean))].sort()
  const duration = dateDays(r.startDate, r.endDate, r.countAs).length
  const previewReady =
    annual ||
    !!(draft.name.trim() && draft.category && (closure ? duration : r.unlimited || r.days > 0))
  function set<K extends keyof PolicyRules>(key: K, value: PolicyRules[K]) {
    setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: value } }))
  }
  const select = (label: string, key: keyof PolicyRules, options: readonly string[]) => (
    <SelectField
      label={label}
      placeholder={`Select ${label.toLowerCase()}`}
      value={String(r[key])}
      options={options}
      onChange={(v) => set(key, v as never)}
    />
  )
  const number = (label: string, key: keyof PolicyRules, min = 0, max = 366) => (
    <Field
      label={label}
      type="number"
      min={min}
      max={max}
      step={key === 'days' ? 0.5 : 1}
      value={key === 'days' && r.days === 0 ? '' : (r[key] as number)}
      onChange={(e) => set(key, Number(e.target.value) as never)}
    />
  )
  const multi = (
    label: string,
    key: 'departments' | 'employmentTypes',
    options: readonly string[],
  ) => (
    <SelectField
      label={label}
      placeholder={`All ${label.toLowerCase()}`}
      value=""
      options={options}
      onChange={() => {}}
      multipleValues={r[key]}
      onMultipleChange={(v) => set(key, v as never)}
      displayValue={r[key].length ? r[key].join(', ') : `All ${label.toLowerCase()}`}
      searchable={key === 'departments'}
      required={annual}
    />
  )
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function close() {
    if (dirty) setDiscard(true)
    else onClose()
  }
  function review() {
    const parsed = savePolicyInput.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setError('')
    setConfirm(true)
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ effectiveFrom: string }>('leaves/policy', draft)
      await onSaved(
        !draft.active
          ? 'Policy made inactive.'
          : closure
            ? 'Closure scheduled.'
            : annual && policy
              ? `Changes saved. The new allowance starts ${prettyDate(result.effectiveFrom)}.`
              : 'Leave policy saved.',
      )
      onClose()
    } catch (e) {
      setError(messageOf(e))
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }
  const affected = state.requests.filter(
    (q) =>
      covered.some((p) => p.id === q.memberId) &&
      q.startDate <= r.endDate &&
      q.endDate >= r.startDate,
  )
  const title = annual
    ? 'Annual Leave'
    : policy
      ? policy.name
      : closure
        ? 'Create mass leave'
        : 'Create custom leave'
  return (
    <div className="policy-page" data-kind={kind}>
      <div className="policy-back">
        <button className="text-button" onClick={close}>
          <ArrowLeft size={16} /> {annual ? 'Configure annual leaves' : title}
        </button>
      </div>
      <div className="policy-layout">
        {!annual && (
          <aside className="policy-introduction">
            <h1>{closure ? 'Mass leave' : 'Custom leave'}</h1>
            <p>
              {closure
                ? 'Schedule time off for the company and manage its effect on leave balances.'
                : 'Custom leave serves as a category for all types of leave other than annual leave and collective leave.'}
            </p>
            <Toggle
              label={draft.active ? 'Active' : 'Inactive'}
              checked={draft.active}
              onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
            />
          </aside>
        )}
        <form
          className="policy-editor"
          onSubmit={(e) => {
            e.preventDefault()
            review()
          }}
        >
          {annual && (
            <header className="policy-title">
              <div>
                <h1>{title}</h1>
                <p>
                  {annual
                    ? 'Set the annual leave entitlement and request rules for your employees.'
                    : closure
                      ? 'Schedule time off for your company.'
                      : 'Create a leave policy for your employees.'}
                </p>
              </div>
              <Toggle
                label={draft.active ? 'Active' : 'Inactive'}
                checked={draft.active}
                onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
              />
            </header>
          )}
          <Notice>{error}</Notice>
          {!annual && (
            <Section
              title={closure ? 'The closure' : 'Basic information'}
              description={
                closure
                  ? 'Give this closure a name and tell your team why.'
                  : 'Define the leave name and category.'
              }
            >
              <div className="leave-two-fields">
                <Field
                  label={closure ? 'Event name' : 'Leave name'}
                  required
                  maxLength={60}
                  disabled={!!policy}
                  value={draft.name}
                  placeholder={closure ? 'Enter event name' : 'Enter leave name'}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <SelectField
                  label={closure ? 'Reason' : 'Category'}
                  placeholder={closure ? 'Select reason' : 'Select category'}
                  value={draft.category}
                  options={closure ? closureReasons : categories}
                  onChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                />
              </div>
              <label className="field">
                Description
                <textarea
                  value={draft.description}
                  rows={3}
                  maxLength={2000}
                  placeholder="Add a description"
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
            </Section>
          )}
          {closure && (
            <Section title="Dates" description="Select the date range for this closure.">
              <div className="leave-two-fields">
                <Field
                  label="Start date"
                  required
                  type="date"
                  min={state.today}
                  value={r.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                />
                <Field
                  label="End date"
                  required
                  type="date"
                  min={r.startDate || state.today}
                  value={r.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              </div>
              <Radio
                label="Count days as"
                value={r.countAs}
                options={['Working days', 'Calendar days']}
                onChange={(v) => set('countAs', v as PolicyRules['countAs'])}
              />
              <p className="policy-help">
                {duration} {r.countAs.toLowerCase()}
              </p>
            </Section>
          )}
          <Section
            title={annual ? 'Eligibility' : 'Coverage'}
            description={
              annual ? 'Who can use annual leave.' : 'Choose who can use this leave policy.'
            }
          >
            {annual ? (
              <div className="leave-two-fields">
                <CountSelect
                  label="Eligible after"
                  value={r.eligibleMonths}
                  choices={[0, 1, 3, 6, 12]}
                  zero="Immediately"
                  unit="months of service"
                  max={600}
                  onChange={(v) => set('eligibleMonths', v)}
                />
                {multi('Employment status', 'employmentTypes', employmentOptions)}
              </div>
            ) : (
              <>
                <Radio
                  label="Who can use this leave?"
                  value={r.coverage}
                  options={['All employees', 'Set eligibility']}
                  onChange={(v) => {
                    set('coverage', v as PolicyRules['coverage'])
                    if (v === 'All employees')
                      setDraft((d) => ({
                        ...d,
                        rules: {
                          ...d.rules,
                          coverage: 'All employees',
                          employmentTypes: [],
                          departments: [],
                          gender: 'All genders',
                        },
                      }))
                  }}
                />
                {r.coverage === 'Set eligibility' && (
                  <div className="leave-two-fields">
                    {!closure && select('Gender', 'gender', ['All genders', 'Female', 'Male'])}
                    {multi('Employment types', 'employmentTypes', employmentOptions)}
                    {multi('Departments', 'departments', departments)}
                  </div>
                )}
              </>
            )}
            <p className="policy-help">{covered.length} members covered</p>
          </Section>
          {!closure && (
            <>
              <Section
                title="Allowance"
                description="How many days are granted and when the balance resets."
              >
                {!annual && (
                  <Radio
                    label="Allowance type"
                    value={r.unlimited ? 'Unlimited' : 'Limited'}
                    options={['Limited', 'Unlimited']}
                    onChange={(v) => set('unlimited', v === 'Unlimited')}
                  />
                )}
                {!r.unlimited && (
                  <div className="leave-two-fields">
                    {annual ? (
                      <CountSelect
                        label="Days per year"
                        value={r.days}
                        choices={Array.from({ length: 30 }, (_, i) => i + 1)}
                        max={365}
                        onChange={(v) => set('days', v)}
                      />
                    ) : (
                      number('Allowance', 'days', 0.5, 365)
                    )}
                    {annual
                      ? select('Reset balance on', 'reset', ['January 1', 'Employee join date'])
                      : select('Count days as', 'countAs', ['Working days', 'Calendar days'])}
                    {!annual &&
                      select('Allowance period', 'period', [
                        'Per month',
                        'Per quarter',
                        'Per year',
                      ])}
                  </div>
                )}
              </Section>
              <Section
                title={annual ? 'Request rules' : 'Request requirement'}
                description={
                  annual
                    ? 'Set limits for leave requests.'
                    : 'Set notice period and document requirement.'
                }
              >
                <Radio
                  label="Minimum notice"
                  value={
                    [0, 7, 14].includes(r.notice)
                      ? r.notice === 0
                        ? 'No minimum'
                        : `${r.notice} days`
                      : 'Custom'
                  }
                  options={['No minimum', '7 days', '14 days', 'Custom']}
                  onChange={(v) =>
                    set(
                      'notice',
                      v === 'Custom' ? 1 : v === 'No minimum' ? 0 : Number(v.split(' ')[0]),
                    )
                  }
                />
                {![0, 7, 14].includes(r.notice) && number('Custom notice (days)', 'notice')}
                {annual ? (
                  <>
                    <div className="leave-two-fields">
                      <RequestLimit
                        rules={r}
                        onChange={(count, period) =>
                          setDraft((d) => ({
                            ...d,
                            rules: { ...d.rules, maxRequests: count, requestPeriod: period },
                          }))
                        }
                      />
                      <CountSelect
                        label="Maximum duration per request"
                        value={r.maxDuration}
                        choices={[0, 1, 2, 3, 5, 7, 10]}
                        unit="working days"
                        onChange={(v) => set('maxDuration', v)}
                      />
                    </div>
                    <Radio
                      label="Leave duration"
                      value={r.halfDay ? 'Full day or half day' : 'Full day only'}
                      options={['Full day only', 'Full day or half day']}
                      onChange={(v) => set('halfDay', v === 'Full day or half day')}
                    />
                  </>
                ) : (
                  <Radio
                    label="Supporting document"
                    value={r.document}
                    options={['Not required', 'Optional', 'Required']}
                    onChange={(v) => set('document', v as PolicyRules['document'])}
                  />
                )}
              </Section>
              <Section
                title={annual ? 'Team availability and approval' : 'Approval and availability'}
                description="Limit overlapping leave and choose who reviews requests."
              >
                {!annual && (
                  <Toggle
                    label="Limit overlapping leave"
                    checked={r.maxOff > 0}
                    onChange={(v) => set('maxOff', v ? 1 : 0)}
                  />
                )}
                {(annual || r.maxOff > 0) && (
                  <div className="leave-two-fields">
                    <CountSelect
                      label="Maximum employees off"
                      value={r.maxOff}
                      choices={[0, 1, 2, 3, 4, 5]}
                      unit="members"
                      max={10000}
                      onChange={(v) => set('maxOff', v)}
                    />
                    {select('Limit within', 'limitWithin', ['Department', 'Company'])}
                  </div>
                )}
                <div className="policy-soft-panel">
                  <Toggle
                    label="Approval"
                    checked={r.approval}
                    onChange={(v) => set('approval', v)}
                  />
                  {r.approval &&
                    select('Approver', 'approver', ['Department manager', 'Owner', 'HR Admin'])}
                </div>
              </Section>
            </>
          )}
          {closure && (
            <>
              <Section
                title="Annual leave treatment"
                description="Decide how these days affect employee annual leave balances."
              >
                <Radio
                  label="Treatment"
                  value={r.deductAnnual ? 'Deduct from annual leave' : 'Company-provided days off'}
                  options={['Company-provided days off', 'Deduct from annual leave']}
                  onChange={(v) => set('deductAnnual', v === 'Deduct from annual leave')}
                />
              </Section>
              <Section
                title="Attendance and pay"
                description="How these days are recorded and the payment terms for the closure."
              >
                {select('Attendance status', 'attendance', [
                  'Company holiday',
                  'Paid leave',
                  'Unpaid leave',
                  'Excused absence',
                ])}
                <Radio
                  label="Payment"
                  value={r.payment}
                  options={['Fully Paid', 'Unpaid']}
                  onChange={(v) => set('payment', v as PolicyRules['payment'])}
                />
              </Section>
            </>
          )}
          <section className="policy-section">
            <button
              type="button"
              className="policy-disclosure"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <span>
                <strong>{closure ? 'Existing requests' : 'Advanced setting'}</strong>
                <small>
                  {closure
                    ? 'Keep existing leave and balances consistent.'
                    : 'Configure payment and unused balance.'}
                </small>
              </span>
              <span>
                {advanced ? 'Hide settings' : 'Show settings'} <ChevronDown size={16} />
              </span>
            </button>
            {advanced && (
              <div className="policy-fields">
                {closure ? (
                  <>
                    {select('Already approved requests', 'approvedRequests', [
                      'Refund their balances',
                      'Keep existing requests',
                    ])}
                    {select('Pending requests', 'pendingRequests', [
                      'Cancel automatically',
                      'Keep pending requests',
                    ])}
                    <label className="policy-checkbox">
                      <input
                        type="checkbox"
                        checked={r.blockRequests}
                        onChange={(e) => set('blockRequests', e.target.checked)}
                      />
                      Block new leave requests on these dates
                    </label>
                  </>
                ) : (
                  <>
                    <Radio
                      label="Payment"
                      value={r.payment}
                      options={
                        annual
                          ? ['Fully Paid', 'Unpaid']
                          : ['Fully Paid', 'Unpaid', 'Partial', 'Tiered Pay']
                      }
                      onChange={(v) => set('payment', v as PolicyRules['payment'])}
                    />
                    {r.payment === 'Partial' && number('Pay rate (%)', 'payRate', 0, 100)}
                    {r.payment === 'Tiered Pay' && (
                      <div className="policy-fields">
                        {r.payPeriods.map((p, i) => (
                          <div className="policy-pay-row" key={i}>
                            {(['from', 'to', 'rate'] as const).map((key) => (
                              <Field
                                key={key}
                                label={
                                  key === 'rate'
                                    ? 'Pay rate (%)'
                                    : `${key === 'from' ? 'From' : 'To'} day`
                                }
                                type="number"
                                min={key === 'rate' ? 0 : 1}
                                max={key === 'rate' ? 100 : 366}
                                value={p[key]}
                                onChange={(e) =>
                                  set(
                                    'payPeriods',
                                    r.payPeriods.map((x, j) =>
                                      j === i ? { ...x, [key]: Number(e.target.value) } : x,
                                    ),
                                  )
                                }
                              />
                            ))}
                            <button
                              className="icon-button"
                              type="button"
                              aria-label={`Remove pay period ${i + 1}`}
                              onClick={() =>
                                set(
                                  'payPeriods',
                                  r.payPeriods.filter((_, j) => i !== j),
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            set('payPeriods', [
                              ...r.payPeriods,
                              {
                                from: (r.payPeriods.at(-1)?.to ?? 0) + 1,
                                to: (r.payPeriods.at(-1)?.to ?? 0) + 30,
                                rate: 100,
                              },
                            ])
                          }
                        >
                          <Plus size={16} />
                          Add pay period
                        </Button>
                      </div>
                    )}
                    {!annual && (
                      <Radio
                        label="Leave can be taken as"
                        value={r.halfDay ? 'Full day or half day' : 'Full day only'}
                        options={['Full day only', 'Full day or half day']}
                        onChange={(v) => set('halfDay', v === 'Full day or half day')}
                      />
                    )}
                    {annual && (
                      <>
                        {select('Unused balance at year end', 'unused', [
                          'Expire unused days',
                          'Carry forward',
                          'Pay out unused days',
                        ])}
                        {r.unused === 'Pay out unused days' && (
                          <div className="leave-two-fields">
                            {number('Amount per unused day (Rp)', 'payout', 0, 1_000_000_000)}
                            <SelectField
                              label="Include in payroll"
                              placeholder="Select month"
                              value={new Intl.DateTimeFormat('en', { month: 'long' }).format(
                                new Date(2026, r.payrollMonth - 1, 1),
                              )}
                              options={Array.from({ length: 12 }, (_, i) =>
                                new Intl.DateTimeFormat('en', { month: 'long' }).format(
                                  new Date(2026, i, 1),
                                ),
                              )}
                              onChange={(v) =>
                                set(
                                  'payrollMonth',
                                  Array.from({ length: 12 }, (_, i) =>
                                    new Intl.DateTimeFormat('en', { month: 'long' }).format(
                                      new Date(2026, i, 1),
                                    ),
                                  ).indexOf(v) + 1,
                                )
                              }
                            />
                          </div>
                        )}
                        {r.unused === 'Carry forward' && (
                          <p className="hint">Unused days carry into the next allowance period.</p>
                        )}
                      </>
                    )}
                    <p className="hint">
                      Payment terms are saved with this policy. Payroll processing is managed
                      separately.
                    </p>
                  </>
                )}
              </div>
            )}
          </section>
          <footer className="policy-actions">
            <Button type="button" className="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">{policy ? 'Save changes' : 'Create policy'}</Button>
          </footer>
        </form>
        <aside className="policy-overview">
          <h2>{draft.name || (closure ? 'New mass leave' : 'New leave')} overview</h2>
          <div className="policy-overview-content">
            {!previewReady ? (
              <div className="policy-preview-empty">
                <strong>—</strong>
                <p>Complete the form to see a preview of your leave policy</p>
              </div>
            ) : (
              <div className="leave-balance">
                <div>
                  <strong>{closure ? duration : r.unlimited ? '∞' : r.days}</strong>
                  <span>
                    {closure ? r.countAs : annual ? 'Work days per year' : r.period.toLowerCase()}
                  </span>
                </div>
                <div>
                  <strong>{covered.length}</strong>
                  <span>Members covered</span>
                </div>
              </div>
            )}
            <dl className="leave-detail-list">
              {(closure
                ? [
                    ['Annual leave', r.deductAnnual ? 'Deducted' : 'Not deducted'],
                    ['Attendance', r.attendance],
                    ['Payment', r.payment],
                    ['Start date', r.startDate ? prettyDate(r.startDate) : '—'],
                    ['End date', r.endDate ? prettyDate(r.endDate) : '—'],
                    ['Duration', daysText(duration)],
                    ['Count as', r.countAs],
                  ]
                : !annual
                  ? [
                      [
                        'Eligible',
                        r.coverage === 'All employees'
                          ? 'All employees'
                          : r.employmentTypes.join(', ') || r.departments.join(', ') || r.gender,
                      ],
                      ['Minimum notice', r.notice ? daysText(r.notice) : 'No minimum'],
                      ['Document', r.document],
                      ['Approval', r.approval ? r.approver : 'Not required'],
                      [
                        'Team limit',
                        r.maxOff ? `${r.maxOff} per ${r.limitWithin.toLowerCase()}` : 'No limit',
                      ],
                      ['Leave unit', r.halfDay ? 'Full day or half day' : 'Full day only'],
                      ['Payment', r.payment],
                    ]
                  : [
                      [
                        'Eligible after',
                        r.eligibleMonths ? `${r.eligibleMonths} months of service` : 'Immediately',
                      ],
                      ['Employment', r.employmentTypes.join(', ') || 'All employment types'],
                      ['Resets on', r.reset],
                      [
                        'Maximum requests',
                        r.maxRequests
                          ? `${r.maxRequests} ${r.requestPeriod.toLowerCase()}`
                          : 'No limit',
                      ],
                      ['Maximum duration', r.maxDuration ? daysText(r.maxDuration) : 'No limit'],
                      [
                        'Team availability',
                        r.maxOff ? `${r.maxOff} per ${r.limitWithin.toLowerCase()}` : 'No limit',
                      ],
                      ['Approver', r.approval ? r.approver : 'Not required'],
                      ['Payment', r.payment],
                      ['Unused balance', r.unused],
                    ]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{previewReady ? v : '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
      {confirm && (
        <DetailDialog
          title={
            !draft.active
              ? 'Make this policy inactive?'
              : closure
                ? 'Schedule this closure?'
                : annual
                  ? 'Save annual leave changes?'
                  : 'Save this leave policy?'
          }
          description="Review how these changes will apply."
          onClose={() => setConfirm(false)}
          busy={busy}
          footer={
            <>
              <Button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Keep editing
              </Button>
              <Button type="button" busy={busy} onClick={() => void save()}>
                {!draft.active ? 'Make inactive' : closure ? 'Schedule closure' : 'Save changes'}
              </Button>
            </>
          }
        >
          <dl className="leave-detail-list">
            <div>
              <dt>Policy</dt>
              <dd>{draft.name}</dd>
            </div>
            <div>
              <dt>Members covered</dt>
              <dd>{covered.length}</dd>
            </div>
            {closure ? (
              <>
                <div>
                  <dt>Dates</dt>
                  <dd>
                    {prettyDate(r.startDate)} → {prettyDate(r.endDate)}
                  </dd>
                </div>
                <div>
                  <dt>Annual leave</dt>
                  <dd>{r.deductAnnual ? `${duration} days deducted` : 'Not deducted'}</dd>
                </div>
                <div>
                  <dt>Approved requests</dt>
                  <dd>
                    {r.approvedRequests === 'Refund their balances'
                      ? `${affected.filter((q) => q.status === 'approved').length} balances adjusted`
                      : 'Kept unchanged'}
                  </dd>
                </div>
                <div>
                  <dt>Pending requests</dt>
                  <dd>
                    {r.pendingRequests === 'Cancel automatically'
                      ? `${affected.filter((q) => q.status === 'pending').length} cancelled`
                      : 'Kept unchanged'}
                  </dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Allowance</dt>
                <dd>{r.unlimited ? 'Unlimited' : daysText(r.days)}</dd>
              </div>
            )}
          </dl>
          <p className="hint">
            {!draft.active
              ? 'New requests cannot use this policy. Existing requests are retained.'
              : annual && policy
                ? `Current balances and existing requests stay unchanged. Updated allowance applies from January 1, ${Number(state.today.slice(0, 4)) + 1}.`
                : closure && r.blockRequests
                  ? 'New requests will be blocked on these dates.'
                  : 'Changes apply to new leave requests.'}
          </p>
        </DetailDialog>
      )}
      {discard && (
        <DetailDialog
          title="Discard your changes?"
          onClose={() => setDiscard(false)}
          footer={
            <>
              <Button type="button" className="secondary" onClick={() => setDiscard(false)}>
                Keep editing
              </Button>
              <Button type="button" className="destructive" onClick={onClose}>
                Discard changes
              </Button>
            </>
          }
        >
          <p>Your changes have not been saved.</p>
        </DetailDialog>
      )}
    </div>
  )
}
