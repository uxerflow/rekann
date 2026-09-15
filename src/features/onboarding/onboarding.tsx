import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { avatarInitials, initialAvatar } from '../../lib/initial-avatar'
import { api, messageOf, signOut } from '../../lib/api'
import { loadWorkspace } from '../../lib/loaders'
import {
  Avatar,
  Brand,
  Button,
  Field,
  FormFields,
  ImagePicker,
  mediaUrl,
  Notice,
} from '../../components/ui'
import { workspaceInput, profileInput } from '../../shared/contracts'
import { countries } from '../../shared/countries'
import { SelectField } from '../../components/select-field'
import type { WorkspaceDetails } from '../../server/workspaces'

function OnboardingLayout({
  step,
  children,
  preview,
  caption,
  title,
  profile = false,
  totalSteps = 2,
}: {
  step: number
  children: React.ReactNode
  preview: React.ReactNode
  caption: string
  title: string
  profile?: boolean
  totalSteps?: number
}) {
  const [error, setError] = useState('')
  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <div className="onboarding-brand">
          <Brand compact />
          <span className="step">
            <span className="step-indicator" aria-hidden="true">
              <span
                className="step-dot"
                style={{ '--progress': `${(step / totalSteps) * 100}%` } as React.CSSProperties}
              />
            </span>{' '}
            Step {step}/{totalSteps}
          </span>
        </div>
        <span className="header-label">{title}</span>
        <button
          className="button secondary small"
          onClick={() => void signOut().catch((e) => setError(messageOf(e)))}
        >
          Sign out
        </button>
      </header>
      <div className="onboarding-body">
        <aside className={`onboarding-aside ${profile ? 'profile' : 'company'}`}>
          <div className="preview-content">
            {preview}
            <p className="preview-caption">{caption}</p>
          </div>
        </aside>
        <main className="onboarding-main">
          <div className="onboarding-form">
            <Notice>{error}</Notice>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
const industries = [
  'Agency & consulting',
  'Design studio',
  'Education',
  'Finance',
  'Healthcare',
  'Hospitality',
  'Manufacturing',
  'Nonprofit',
  'Retail',
  'Technology',
  'Other',
]
export function CompanyOnboarding({
  company,
  onContinue,
}: {
  company?: WorkspaceDetails['workspace']
  onContinue?: (company: WorkspaceDetails['workspace']) => void
} = {}) {
  const [name, setName] = useState(company?.name || '')
  const [description, setDescription] = useState(company?.description || '')
  const [country, setCountry] = useState(company?.country || '')
  const [industry, setIndustry] = useState(company?.industry || '')
  const [timeZone, setTimeZone] = useState(company?.timeZone || 'UTC')
  useEffect(() => {
    if (!company) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [company])
  const [logo, setLogo] = useState('')
  const [createdId, setCreatedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const parsed = workspaceInput.safeParse({ name, description, country, industry, timeZone })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    setBusy(true)
    try {
      const result = company
        ? await api<{ id: string }>('workspace/onboarding-update', {
            ...parsed.data,
            workspaceId: company.id,
          })
        : createdId
          ? { id: createdId }
          : await api<{ id: string }>('workspace/create', parsed.data)
      if (!company) setCreatedId(result.id)
      if (logo) await api('media', { workspaceId: result.id, kind: 'logo', data: logo })
      if (company && onContinue) {
        const refreshed = logo ? await loadWorkspace({ data: { id: company.id } }) : null
        onContinue(refreshed?.workspace || { ...company, ...parsed.data })
        return
      }
      window.location.assign(`/onboarding/profile?workspaceId=${result.id}`)
    } catch (error) {
      setError(messageOf(error))
      setBusy(false)
    }
  }
  return (
    <OnboardingLayout
      step={1}
      title="About your company"
      caption="Your company profile is ready to bring your team together. This is how your company will appear to everyone in your workspace."
      preview={
        <div className="company-preview">
          <div className="preview-inner">
            <Avatar name={name} image={logo || mediaUrl(company?.logoKey)} large placeholder />
            <h2>{name || 'Company name'}</h2>
            {description ? (
              <p>{description}</p>
            ) : (
              <div className="skeleton-lines">
                <i />
                <i />
                <i />
              </div>
            )}
            <div className="preview-meta">
              <span>
                <img src="/icons/location.svg" alt="" />
                {country || 'Location'}
              </span>
              <span>
                <img src="/icons/building.svg" alt="" />
                {industry || 'Industry'}
              </span>
            </div>
          </div>
        </div>
      }
    >
      <div className="onboarding-heading">
        <h1>Tell us about your company</h1>
        <p>Let’s start with a few details to personalize your workspace.</p>
      </div>
      <form onSubmit={submit}>
        <FormFields busy={busy}>
          <Notice>{error}</Notice>
          <ImagePicker
            label="Company logo"
            value={logo || mediaUrl(company?.logoKey) || ''}
            onChange={setLogo}
          />
          <Field
            label="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="e.g. Acme Inc."
            disabled={!!createdId}
          />
          <div className="field">
            <label htmlFor="description">
              Company description<span className="required">*</span>
            </label>
            <textarea
              id="description"
              required
              maxLength={200}
              rows={3}
              value={description}
              disabled={!!createdId}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell your team a little about your company."
            />
            <span className="character-count">{description.length}/200</span>
          </div>
          <SelectField
            label="Location"
            placeholder="Select a country"
            value={country}
            options={countries}
            onChange={setCountry}
            searchable
            disabled={!!createdId || busy}
          />
          <SelectField
            label="Industry"
            placeholder="Select an industry"
            value={industry}
            options={industries}
            onChange={setIndustry}
            disabled={!!createdId || busy}
          />
          <div className="form-actions">
            <Button
              busy={busy}
              type="submit"
              disabled={
                !workspaceInput.safeParse({ name, description, country, industry, timeZone })
                  .success
              }
            >
              Continue
            </Button>
          </div>
        </FormFields>
      </form>
    </OnboardingLayout>
  )
}
export function ProfileOnboarding({
  data,
  editing = false,
}: {
  data: WorkspaceDetails
  editing?: boolean
}) {
  const [employeeDetailsStep, setDetailsStep] = useState(false)
  const [companyStep, setCompanyStep] = useState(false)
  const [company, setCompany] = useState(data.workspace)
  const isWorkspaceCreator = data.workspace.createdBy === data.employee.userId
  const detailsStep = editing || (!isWorkspaceCreator && employeeDetailsStep)
  const initial = data.employee
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [jobTitle, setJobTitle] = useState(initial.jobTitle)
  const [phone, setPhone] = useState(initial.phone)
  const [birthDate, setBirthDate] = useState(initial.birthDate || '')
  const [birthPlace, setBirthPlace] = useState(initial.birthPlace)
  const [uploadedImage, setImage] = useState('')
  const [avatarColor, setAvatarColor] = useState<number | null>(null)
  const initials = avatarInitials(`${firstName} ${lastName}`)
  const image = useMemo(
    () => (avatarColor === null ? uploadedImage : initialAvatar(avatarColor, initials)),
    [avatarColor, initials, uploadedImage],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const parsed = profileInput.safeParse({
      workspaceId: data.workspace.id,
      firstName,
      lastName,
      jobTitle,
      phone,
      birthDate,
      birthPlace,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }
    if (!editing && !isWorkspaceCreator && !detailsStep) {
      setDetailsStep(true)
      window.scrollTo({ top: 0 })
      return
    }
    setBusy(true)
    try {
      if (image) await api('media', { workspaceId: data.workspace.id, kind: 'avatar', data: image })
      await api('profile/save', parsed.data)
      window.location.assign(`/workspace/${data.workspace.id}`)
    } catch (error) {
      setError(messageOf(error))
      setBusy(false)
    }
  }
  if (companyStep)
    return (
      <CompanyOnboarding
        company={company}
        onContinue={(updated) => {
          setCompany(updated)
          setCompanyStep(false)
          window.scrollTo({ top: 0 })
        }}
      />
    )
  return (
    <OnboardingLayout
      step={editing || isWorkspaceCreator ? 2 : detailsStep ? 2 : 1}
      totalSteps={2}
      profile
      title={detailsStep && !editing ? 'Employee details' : 'Your profile'}
      caption="Your profile helps your team get to know you. This is how your name, photo, and job title will appear in your workspace."
      preview={
        <div className="profile-preview">
          <img className="lanyard" src="/images/lanyard.svg" alt="" />
          <div className="preview-inner">
            <div className="badge-slot" aria-hidden="true" />
            <Avatar
              name={`${firstName} ${lastName}`}
              image={image || mediaUrl(initial.avatarKey)}
              large
              placeholder
            />
            <h2 className={firstName || lastName ? undefined : 'preview-placeholder'}>
              {`${firstName} ${lastName}`.trim() || 'Full Name'}
            </h2>
            <p className={jobTitle ? undefined : 'preview-placeholder'}>
              {jobTitle || 'Job Title'}
            </p>
          </div>
        </div>
      }
    >
      <div className="onboarding-heading">
        <h1>
          {editing
            ? 'Edit your profile'
            : detailsStep
              ? 'A little more about you'
              : 'Tell us about yourself'}
        </h1>
        <p>
          {editing
            ? 'Keep your information up to date.'
            : detailsStep
              ? 'These details are optional and only visible to you.'
              : 'Tell your team a little about you.'}
        </p>
      </div>
      <form onSubmit={submit}>
        <FormFields busy={busy}>
          <Notice>{error}</Notice>
          {(!detailsStep || editing) && (
            <>
              <ImagePicker
                label="Profile photo"
                value={image || mediaUrl(initial.avatarKey) || ''}
                onChange={(value) => {
                  setAvatarColor(null)
                  setImage(value)
                }}
                onColorChange={setAvatarColor}
                avatarName={`${firstName} ${lastName}`}
              />
              <div className="field-row">
                <Field
                  label="First name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="e.g. Alex"
                />
                <Field
                  label="Last name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Carter"
                  required
                />
              </div>
              <Field
                label="Job title"
                autoComplete="organization-title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. Founder"
                required
              />
            </>
          )}
          {detailsStep && (
            <>
              {editing && (
                <div className="form-divider">
                  <span>Personal details</span>
                  <p className="hint">Optional. Only you can view these details.</p>
                </div>
              )}
              <Field
                label="Phone number"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                placeholder="Include country code"
              />
              <div className="field-row">
                <Field
                  label="Place of birth"
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  maxLength={100}
                  placeholder="City"
                />
                <Field
                  label="Date of birth"
                  type="date"
                  autoComplete="bday"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </>
          )}
          <div className="form-actions">
            {isWorkspaceCreator && !editing && (
              <button
                type="button"
                className="button secondary onboarding-back"
                onClick={() => {
                  setCompanyStep(true)
                  setError('')
                  window.scrollTo({ top: 0 })
                }}
              >
                Back
              </button>
            )}
            {detailsStep && !editing && (
              <button
                type="button"
                className="button secondary onboarding-back"
                onClick={() => {
                  setDetailsStep(false)
                  setError('')
                }}
              >
                Back
              </button>
            )}
            {editing && (
              <a
                className="button secondary onboarding-back"
                href={`/workspace/${data.workspace.id}`}
              >
                Back
              </a>
            )}
            <Button
              busy={busy}
              type="submit"
              disabled={!firstName.trim() || !lastName.trim() || !jobTitle.trim()}
            >
              {editing
                ? 'Save changes'
                : isWorkspaceCreator || detailsStep
                  ? 'Go to workspace'
                  : 'Continue'}
            </Button>
          </div>
        </FormFields>
      </form>
    </OnboardingLayout>
  )
}
