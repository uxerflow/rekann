import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Button, Field, ImagePicker, Notice, mediaUrl } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { api, messageOf } from '../../lib/api'
import { initialAvatar, avatarInitials } from '../../lib/initial-avatar'
import { countries } from '../../shared/countries'
import {
  emptyEmployee,
  employeeFields,
  saveEmployeeInput,
  type EmployeeFields,
} from '../../shared/employee-input'
import type { WorkspaceDetails } from '../../server/workspaces'
import type { EmployeeDetails, employeeOptions } from '../../server/employees'
import { employmentTypes } from './directory-model'
import { WorkspaceClock } from '../workspace/dashboard-shell'
import './add-employee.css'

type Options = Awaited<ReturnType<typeof employeeOptions>>
const managerLabel = (m: Options['managers'][number]) => `${m.name} (${m.email})`
export function AddEmployee({ data, recordId }: { data: WorkspaceDetails; recordId?: string }) {
  const base = `/w/${data.workspace.slug}/team`
  const [id, setId] = useState(recordId ?? '')
  const [version, setVersion] = useState(0)
  const [fields, setFields] = useState<EmployeeFields>({ ...emptyEmployee })
  const [step, setStep] = useState(0)
  const [options, setOptions] = useState<Options>({
    departments: [],
    locations: [],
    schedules: [],
    managers: [],
    allowManager: false,
  })
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [image, setImage] = useState('')
  const [photoChanged, setPhotoChanged] = useState(false)
  const [savedImage, setSavedImage] = useState('')
  const [color, setColor] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)
  const leave = useRef<HTMLDialogElement>(null)
  const allowLeave = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const photo = useMemo(
    () => (color === null ? image : initialAvatar(color, avatarInitials(fields.fullName))),
    [color, image, fields.fullName],
  )
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !allowLeave.current,
    enableBeforeUnload: () => dirty && !allowLeave.current,
    withResolver: true,
  })
  useEffect(() => {
    if (blocker.status === 'blocked') leave.current?.showModal()
  }, [blocker.status])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    setError('')
    Promise.all([
      api<Options>(`employee/options?workspaceId=${data.workspace.id}`),
      recordId
        ? api<EmployeeDetails>(`employee/record?workspaceId=${data.workspace.id}&id=${recordId}`)
        : Promise.resolve(null),
    ])
      .then(([o, r]) => {
        if (cancelled) return
        setOptions(o)
        if (r) {
          if (r.memberId || r.invitationId)
            throw new Error(
              'This employee already has an invitation or an account. Open their record from the directory.',
            )
          setFields(r.fields)
          setVersion(r.version)
          setSavedImage(mediaUrl(r.avatarKey) || '')
        } else setId(crypto.randomUUID())
        setLoading(false)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(messageOf(e))
          setLoadFailed(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [data.workspace.id, recordId, retry])
  function change<K extends keyof EmployeeFields>(key: K, value: EmployeeFields[K]) {
    setFields((f) => ({ ...f, [key]: value }))
    setDirty(true)
    setError('')
  }
  function go(next: number) {
    setStep(next)
    setError('')
    window.scrollTo({ top: 0 })
    requestAnimationFrame(() => document.getElementById('add-employee-heading')?.focus())
  }
  function continueStep(e: FormEvent) {
    e.preventDefault()
    const parsed =
      step === 0
        ? employeeFields
            .pick({ fullName: true, email: true, employeeNumber: true, phone: true })
            .strip()
            .safeParse(fields)
        : employeeFields.pick({ startDate: true }).strip().safeParse(fields)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    if (step === 1 && !fields.startDate) {
      setError('Choose a start date.')
      return
    }
    go(step + 1)
  }
  async function generate() {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ employeeNumber: string }>(
        `employee/next-number?workspaceId=${data.workspace.id}`,
      )
      change('employeeNumber', result.employeeNumber)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  async function save(status: 'draft' | 'ready') {
    const body = { workspaceId: data.workspace.id, id, version, status, fields }
    const parsed = saveEmployeeInput.safeParse(body)
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await api<{ id: string; version: number }>('employee/save', body)
      setVersion(saved.version)
      if (photoChanged) {
        await api('media', {
          workspaceId: data.workspace.id,
          kind: 'avatar',
          employeeRecordId: saved.id,
          data: photo,
        })
      }
      setDirty(false)
      allowLeave.current = true
      window.location.assign(`${base}/records/${saved.id}${status === 'ready' ? '?invite=1' : ''}`)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }
  function exit() {
    if (dirty) leave.current?.showModal()
    else window.location.assign(base)
  }
  const input = (
    key: keyof EmployeeFields,
    label: string,
    placeholder: string,
    extra: Record<string, unknown> = {},
  ) => (
    <Field
      label={label}
      value={fields[key]}
      onChange={(e) => change(key, e.target.value as never)}
      placeholder={placeholder}
      maxLength={key === 'email' ? 254 : key === 'address' ? 300 : 100}
      {...extra}
    />
  )
  const select = (
    key: keyof EmployeeFields,
    label: string,
    placeholder: string,
    values: readonly string[],
    custom = false,
  ) => (
    <SelectField
      label={label}
      placeholder={placeholder}
      value={fields[key]}
      options={values}
      onChange={(v) => change(key, v as never)}
      required={false}
      searchable={custom || key === 'country' || key === 'nationality'}
      allowCustom={custom}
      disabled={busy}
    />
  )
  const selectedManager = options.managers.find((m) => m.id === fields.reportingManagerId)
  return (
    <div className={`add-employee-page employee-step-${step}`}>
      <header className="add-employee-header">
        <button className="text-button" onClick={exit}>
          <ArrowLeft size={14} />
          Add employee
        </button>
        <div className="add-employee-time">
          <img src="/dashboard/header-time.svg" width="16" height="16" alt="" />
          <WorkspaceClock timeZone={data.workspace.timeZone} />
          <span>{data.workspace.timeZone.replaceAll('_', ' ')}</span>
          <img src="/dashboard/notifications.svg" width="32" height="32" alt="" />
        </div>
      </header>
      <main className="add-employee-main">
        <ol className="employee-steps" aria-label="Add employee progress">
          {['Personal', 'Employment', 'Additional'].map((label, i) => (
            <li key={label} aria-current={step === i ? 'step' : undefined}>
              <span>{i + 1}</span>
              {label}
              {i < 2 && <ChevronRight size={14} />}
            </li>
          ))}
        </ol>
        <div className="add-employee-heading">
          <h1 id="add-employee-heading" tabIndex={-1}>
            {['Add employee', 'Employment & access', 'Additional information'][step]}
          </h1>
          <p>
            {
              [
                'Add the employee’s basic details and the email they’ll use to join Rekann.',
                'Set their role in the company, work schedule, and access to Rekann.',
                'Add more details now, or complete them later from the employee profile.',
              ][step]
            }
          </p>
        </div>
        <Notice>{error}</Notice>
        {loading ? (
          <p role="status">Loading employee form…</p>
        ) : loadFailed ? (
          <Button onClick={() => setRetry((r) => r + 1)}>Reload form</Button>
        ) : (
          <form
            ref={form}
            onSubmit={
              step < 2
                ? continueStep
                : (e) => {
                    e.preventDefault()
                    void save('ready')
                  }
            }
          >
            <fieldset className="employee-form-fields" disabled={busy}>
              {step === 0 && (
                <>
                  <ImagePicker
                    label="Profile photo"
                    value={photo || savedImage}
                    avatarName={fields.fullName}
                    onChange={(v) => {
                      setImage(v)
                      if (!v) setSavedImage('')
                      setPhotoChanged(true)
                      setColor(null)
                      setDirty(true)
                    }}
                    onColorChange={(v) => {
                      setColor(v)
                      setPhotoChanged(true)
                      setDirty(true)
                    }}
                  />
                  {input('fullName', 'Full name', 'e.g. Alex Carter', {
                    required: true,
                    autoComplete: 'name',
                  })}
                  {input('email', 'Work email', 'e.g. alex-carter@company.com', {
                    type: 'email',
                    required: true,
                    autoComplete: 'email',
                  })}
                  <div className="employee-id-row">
                    {input('employeeNumber', 'Employee ID', 'e.g. EMP1001', {
                      required: true,
                      maxLength: 40,
                      hint: 'This will be used for employee reference',
                    })}
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => void generate()}
                      busy={busy}
                    >
                      Auto generate
                    </Button>
                  </div>
                  {input('phone', 'Phone number', 'e.g. +62 812 3456 7890', {
                    type: 'tel',
                    autoComplete: 'tel',
                    maxLength: 30,
                  })}
                </>
              )}
              {step === 1 && (
                <>
                  {select(
                    'department',
                    'Department',
                    'Select department',
                    options.departments,
                    true,
                  )}
                  {input('jobTitle', 'Job title', 'e.g. Software Engineer', { maxLength: 60 })}
                  {select(
                    'employmentType',
                    'Employment type',
                    'Select employment type',
                    employmentTypes,
                  )}
                  {input('startDate', 'Start date', 'DD/MM/YYYY', { type: 'date', required: true })}
                  <SelectField
                    label="Reporting manager"
                    placeholder="Select reporting manager"
                    value={selectedManager ? managerLabel(selectedManager) : 'None'}
                    displayValue={selectedManager?.name || 'Select reporting manager'}
                    options={['None', ...options.managers.map(managerLabel)]}
                    onChange={(v) =>
                      change(
                        'reportingManagerId',
                        options.managers.find((m) => managerLabel(m) === v)?.id || '',
                      )
                    }
                    required={false}
                  />
                  <div className="employee-form-row">
                    {select(
                      'workLocation',
                      'Work location',
                      'Select location',
                      options.locations,
                      true,
                    )}
                    {select(
                      'workSchedule',
                      'Work schedule',
                      'Select schedule',
                      options.schedules,
                      true,
                    )}
                  </div>
                  <fieldset className="employee-access">
                    <legend>Workspace access</legend>
                    <div>
                      {(['employee', 'manager'] as const).map((role) => (
                        <label key={role} className={fields.role === role ? 'selected' : ''}>
                          <input
                            type="radio"
                            name="employee-role"
                            value={role}
                            checked={fields.role === role}
                            disabled={role === 'manager' && !options.allowManager}
                            onChange={() => change('role', role)}
                          />
                          <span>
                            {role === 'employee' ? 'Employee' : 'Manager / HR'}
                            <small>
                              {role === 'employee'
                                ? 'Standard member access to attendance, leave requests, and company directory.'
                                : options.allowManager
                                  ? 'Manager access follows your workspace’s enabled permissions.'
                                  : 'Enable Manager / HR in Settings to assign this role.'}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              {step === 2 && (
                <>
                  <section className="employee-additional-section">
                    <h2>Personal details</h2>
                    <div className="employee-section-fields">
                      <div className="employee-form-row">
                        {input('birthPlace', 'Place of birth', 'e.g. Malang')}
                        {input('birthDate', 'Date of birth', 'DD/MM/YYYY', {
                          type: 'date',
                          max: new Date().toISOString().slice(0, 10),
                        })}
                      </div>
                      {select('nationality', 'Nationality', 'Select nationality', countries)}
                      <div className="employee-form-row">
                        {select('gender', 'Gender', 'Select gender', [
                          'Female',
                          'Male',
                          'Non-binary',
                          'Prefer not to say',
                        ])}
                        {select('maritalStatus', 'Marital status', 'Select marital status', [
                          'Single',
                          'Married',
                          'Divorced',
                          'Widowed',
                          'Prefer not to say',
                        ])}
                      </div>
                    </div>
                  </section>
                  <details className="employee-additional-section">
                    <summary>Identification</summary>
                    <div className="employee-section-fields">
                      {input('nationalId', 'National ID', 'Enter national ID (optional)', {
                        maxLength: 80,
                      })}
                      {input('taxId', 'Personal tax ID', 'Enter tax ID (optional)', {
                        maxLength: 80,
                      })}
                      {input(
                        'healthInsurance',
                        'Health insurance',
                        'Enter health insurance (optional)',
                      )}
                      {input(
                        'socialInsurance',
                        'Social insurance',
                        'Enter social insurance (optional)',
                      )}
                      {input(
                        'drivingLicense',
                        'Driving license',
                        'Enter driving license (optional)',
                        { maxLength: 80 },
                      )}
                    </div>
                  </details>
                  <details className="employee-additional-section">
                    <summary>Address information</summary>
                    <div className="employee-section-fields">
                      {input('address', 'Address', 'Enter street address')}
                      <div className="employee-form-row">
                        {input('city', 'City', 'Enter city')}
                        {input('province', 'Province / State', 'Enter province or state')}
                      </div>
                      <div className="employee-form-row">
                        {input('zipCode', 'ZIP code', 'Enter ZIP code', { maxLength: 20 })}
                        {select('country', 'Country', 'Select country', countries)}
                      </div>
                    </div>
                  </details>
                  <details className="employee-additional-section">
                    <summary>Emergency contact</summary>
                    <div className="employee-section-fields">
                      {input('emergencyName', 'Full name', 'Enter contact’s full name')}
                      <div className="employee-form-row">
                        {input('emergencyPhone', 'Phone number', 'e.g. +62 812 3456 7890', {
                          type: 'tel',
                          maxLength: 30,
                        })}
                        {select('emergencyRelationship', 'Relationship', 'Select relationship', [
                          'Spouse',
                          'Parent',
                          'Sibling',
                          'Child',
                          'Partner',
                          'Friend',
                          'Other',
                        ])}
                      </div>
                    </div>
                  </details>
                </>
              )}
            </fieldset>
            <footer className={`employee-form-actions ${step === 2 ? 'final-step' : ''}`}>
              {step > 0 && (
                <Button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => go(step - 1)}
                >
                  Back
                </Button>
              )}
              {step === 2 && (
                <Button
                  type="button"
                  className="secondary employee-save-draft"
                  busy={busy}
                  onClick={() => void save('draft')}
                >
                  Save as draft
                </Button>
              )}
              <Button type="submit" busy={busy}>
                {step === 2 ? 'Add employee' : 'Continue'}
              </Button>
            </footer>
          </form>
        )}
      </main>
      <dialog
        ref={leave}
        className="confirm-dialog employee-dialog"
        aria-labelledby="discard-title"
        onCancel={() => blocker.status === 'blocked' && blocker.reset()}
      >
        <h2 id="discard-title">Leave without saving?</h2>
        <p>Your unsaved changes will be lost.</p>
        <div className="employee-dialog-actions">
          <Button
            className="secondary"
            onClick={() => {
              if (blocker.status === 'blocked') blocker.reset()
              leave.current?.close()
            }}
          >
            Keep editing
          </Button>
          <Button
            onClick={() => {
              allowLeave.current = true
              if (blocker.status === 'blocked') {
                leave.current?.close()
                blocker.proceed()
              } else window.location.assign(base)
            }}
          >
            Leave
          </Button>
        </div>
      </dialog>
    </div>
  )
}
