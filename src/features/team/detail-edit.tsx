import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Notice, ImagePicker, mediaUrl } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { DetailDialog } from './detail-dialog'
import { api, messageOf } from '../../lib/api'
import type { EmployeeDetail } from '../../server/employee-detail'
import type { EmployeeFields } from '../../shared/employee-input'
import { sectionFields } from '../../shared/employee-detail'
import type { employeeOptions } from '../../server/employees'

type Section = keyof typeof sectionFields
const names: Record<Section, string> = {
  profile: 'profile',
  personal: 'personal information',
  work: 'work information',
  identification: 'identification',
  address: 'address',
  emergency: 'emergency contact',
}
const labels: Partial<Record<keyof EmployeeFields, string>> = {
  fullName: 'Full name',
  email: 'Work email',
  phone: 'Phone number',
  birthPlace: 'Place of birth',
  birthDate: 'Date of birth',
  nationality: 'Nationality',
  gender: 'Gender',
  maritalStatus: 'Marital status',
  employeeNumber: 'Employee ID',
  department: 'Department',
  jobTitle: 'Job title',
  employmentType: 'Employment type',
  startDate: 'Start date',
  reportingManagerId: 'Reporting manager',
  workLocation: 'Work location',
  workSchedule: 'Work schedule',
  nationalId: 'National ID',
  taxId: 'Personal tax ID',
  healthInsurance: 'Health insurance',
  socialInsurance: 'Social insurance',
  drivingLicense: 'Driving license',
  address: 'Address',
  city: 'City',
  province: 'State or province',
  zipCode: 'Postal code',
  country: 'Country',
  emergencyName: 'Full name',
  emergencyPhone: 'Phone number',
  emergencyRelationship: 'Relationship',
}
export function DetailEdit({
  detail,
  workspaceId,
  section,
  options,
  onClose,
  onSaved,
}: {
  detail: EmployeeDetail
  workspaceId: string
  section: Section
  options: Awaited<ReturnType<typeof employeeOptions>> | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [fields, setFields] = useState(detail.fields)
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [extra, setExtra] = useState(detail.additionalContact)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dirty =
    photo !== undefined ||
    JSON.stringify(fields) !== JSON.stringify(detail.fields) ||
    JSON.stringify(extra) !== JSON.stringify(detail.additionalContact)
  async function save() {
    setBusy(true)
    setError('')
    try {
      await api('employee/detail-save', {
        workspaceId,
        id: detail.id,
        version: detail.version,
        section,
        ...(photo !== undefined ? { photo } : {}),
        fields: Object.fromEntries(sectionFields[section].map((k) => [k, fields[k]])),
        ...(section === 'emergency'
          ? { additionalContact: extra || { name: '', phone: '', relationship: '' } }
          : {}),
      })
      await onSaved()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const pick = (key: keyof EmployeeFields, value: string) =>
    setFields((f) => ({ ...f, [key]: value }))
  const lists: Partial<Record<keyof EmployeeFields, string[]>> = {
    gender: ['Female', 'Male', 'Non-binary', 'Prefer not to say'],
    maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'],
    employmentType: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'],
    department: options?.departments || [],
    workLocation: options?.locations || [],
    workSchedule: options?.schedules || [],
    reportingManagerId:
      options?.managers
        .filter((m) => m.id !== detail.memberId)
        .map((m) => `${m.name} · ${m.email}`) || [],
    emergencyRelationship: ['Spouse', 'Parent', 'Sibling', 'Partner', 'Friend', 'Other'],
  }
  return (
    <DetailDialog
      title={`Edit ${names[section]}`}
      description="Update this employee’s details. Changes are saved only when you select Save changes."
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      footer={
        <>
          <Button data-dialog-close className="secondary" disabled={busy}>
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void save()} disabled={!dirty}>
            Save changes
          </Button>
        </>
      }
    >
      <Notice>{error}</Notice>
      <fieldset disabled={busy} className={`detail-fields detail-fields-${section}`}>
        {(section === 'work'
          ? ([
              'employeeNumber',
              'startDate',
              'department',
              'jobTitle',
              'employmentType',
              'workSchedule',
              'reportingManagerId',
              'workLocation',
            ] as const)
          : sectionFields[section]
        ).map((key) => {
          const opts = lists[key]
          const manager = key === 'reportingManagerId'
          const selected = manager ? options?.managers.find((m) => m.id === fields[key]) : null
          const value = manager
            ? selected
              ? `${selected.name} · ${selected.email}`
              : ''
            : fields[key]
          return opts ? (
            <SelectField
              key={key}
              label={labels[key]!}
              required={false}
              placeholder="Not set"
              value={value}
              options={['Not set', ...opts]}
              searchable={
                opts.length > 8 || ['department', 'workLocation', 'workSchedule'].includes(key)
              }
              allowCustom={['department', 'workLocation', 'workSchedule'].includes(key)}
              onChange={(v) =>
                pick(
                  key,
                  v === 'Not set'
                    ? ''
                    : manager
                      ? options?.managers.find((m) => `${m.name} · ${m.email}` === v)?.id || ''
                      : v,
                )
              }
            />
          ) : (
            <Field
              key={key}
              label={labels[key]!}
              value={fields[key]}
              onChange={(e) => pick(key, e.target.value)}
              required={['fullName', 'email', 'employeeNumber', 'startDate'].includes(key)}
              type={
                key === 'email'
                  ? 'email'
                  : key === 'birthDate' || key === 'startDate'
                    ? 'date'
                    : 'text'
              }
              readOnly={key === 'email' && !!detail.memberId}
              hint={
                key === 'email' && detail.memberId
                  ? 'Linked to the employee’s sign-in account.'
                  : undefined
              }
            />
          )
        })}
        {section === 'profile' && (
          <ImagePicker
            label="Profile photo"
            value={photo ?? mediaUrl(detail.avatarKey) ?? ''}
            avatarName={fields.fullName}
            onChange={setPhoto}
          />
        )}
        {section === 'emergency' &&
          (extra ? (
            <div className="detail-additional">
              <div className="employee-section-heading">
                <h3>Additional contact</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove additional contact"
                  onClick={() => setExtra(null)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <Field
                label="Full name"
                value={extra.name}
                onChange={(e) => setExtra({ ...extra, name: e.target.value })}
              />
              <div className="detail-two-fields">
                <Field
                  label="Phone number"
                  value={extra.phone}
                  onChange={(e) => setExtra({ ...extra, phone: e.target.value })}
                />
                <SelectField
                  label="Relationship"
                  required={false}
                  placeholder="Not set"
                  value={extra.relationship}
                  options={lists.emergencyRelationship!}
                  onChange={(v) => setExtra({ ...extra, relationship: v })}
                />
              </div>
            </div>
          ) : (
            <Button
              className="secondary"
              onClick={() => setExtra({ name: '', phone: '', relationship: '' })}
            >
              <Plus size={16} />
              Add new contact
            </Button>
          ))}
      </fieldset>
    </DetailDialog>
  )
}
