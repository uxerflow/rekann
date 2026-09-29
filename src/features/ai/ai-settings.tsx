import { useState } from 'react'
import { ChevronDown, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Button, Field, Notice } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { DetailDialog } from '../team/detail-dialog'
import { api, messageOf } from '../../lib/api'
import type { AiSettings } from '../../shared/ai'
import '../team/employee-detail.css'

const format = (n: number) => n.toLocaleString('en-US')
export function AiConnection({
  workspaceId,
  settings,
  initialFunding,
  onSaved,
  onClose,
}: {
  workspaceId: string
  settings: AiSettings
  initialFunding?: AiSettings['funding']
  onSaved: (s: AiSettings) => void
  onClose: () => void
}) {
  const [funding, setFunding] = useState(initialFunding || settings.funding)
  const included = funding === 'rekann'
  const [enabled, setEnabled] = useState(
    initialFunding && initialFunding !== settings.funding ? true : settings.enabled,
  )
  const [writes, setWrites] = useState(settings.allowWrites)
  const [roles, setRoles] = useState(settings.allowedRoles)
  const [daily, setDaily] = useState(String(settings.workspaceKeyLimits.dailyRequests))
  const [monthly, setMonthly] = useState(format(settings.workspaceKeyLimits.monthlyTokens))
  const monthlyValue = Number(monthly.replaceAll(',', ''))
  const dailyValue = Number(daily)
  const validLimits =
    Number.isInteger(monthlyValue) &&
    monthlyValue >= 16384 &&
    monthlyValue <= 10000000 &&
    Number.isInteger(dailyValue) &&
    dailyValue >= 1 &&
    dailyValue <= 100
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty =
    !!key ||
    funding !== settings.funding ||
    enabled !== settings.enabled ||
    writes !== settings.allowWrites ||
    dailyValue !== settings.workspaceKeyLimits.dailyRequests ||
    monthlyValue !== settings.workspaceKeyLimits.monthlyTokens ||
    JSON.stringify(roles) !== JSON.stringify(settings.allowedRoles)
  async function save(removeKey = false) {
    setBusy(true)
    setError('')
    try {
      const next = await api<AiSettings>(
        removeKey ? 'ai/disconnect' : 'ai/settings',
        removeKey
          ? { workspaceId }
          : {
              workspaceId,
              version: settings.version,
              enabled,
              funding,
              allowWrites: writes,
              allowedRoles: roles,
              dailyRequests: included ? settings.workspaceKeyLimits.dailyRequests : dailyValue,
              monthlyTokens: included ? settings.workspaceKeyLimits.monthlyTokens : monthlyValue,
              ...(!included && key ? { apiKey: key } : {}),
            },
      )
      setKey('')
      onSaved(next)
      onClose()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DetailDialog
      className="ai-dialog"
      title="AI settings"
      description="Your workspace’s assistant, your preferences."
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      footer={
        <>
          <Button className="secondary" data-dialog-close disabled={busy}>
            Cancel
          </Button>
          <Button
            busy={busy}
            onClick={() => void save()}
            disabled={!roles.length || (!included && !validLimits)}
          >
            {!included && key ? 'Connect and save' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="ai-settings-fields">
        <Notice>{error}</Notice>
        <section className="ai-settings-section">
          <SelectField
            label="Workspace connection"
            placeholder="Choose a connection"
            value={included ? 'Rekann AI' : 'Your OpenRouter key'}
            options={['Rekann AI', 'Your OpenRouter key']}
            onChange={(value) => {
              setFunding(value === 'Rekann AI' ? 'rekann' : 'workspace')
              setEnabled(true)
              setKey('')
            }}
            disabled={busy}
            required={false}
          />
          {included ? (
            <p className="hint">
              {settings.builtinAvailable
                ? 'Included with your workspace. No API key needed.'
                : 'Your included assistant is getting ready. There’s nothing you need to set up.'}
            </p>
          ) : (
            <>
              <Field
                label={settings.workspaceKeyConnected ? 'Replace API key' : 'API key'}
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                maxLength={512}
                hint={
                  settings.workspaceKeyConnected
                    ? 'A key is connected. Leave this blank to keep it.'
                    : 'Connect your account to use its balance. Your key is stored securely.'
                }
              />
              {settings.workspaceKeyConnected && (
                <button
                  className="ai-text-button ai-remove-key"
                  type="button"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  Remove key and use Rekann AI
                </button>
              )}
            </>
          )}
        </section>
        <details className="ai-settings-disclosure">
          <summary>
            <ShieldCheck size={16} />
            <span>Access and permissions</span>
            <ChevronDown size={16} />
          </summary>
          <div className="ai-settings-section">
            <fieldset disabled={busy}>
              <legend>Who can use AI</legend>
              {(['admin', 'manager', 'employee'] as const).map((role) => (
                <label className="ai-check" key={role}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={(e) =>
                      setRoles(
                        e.target.checked ? [...roles, role] : roles.filter((r) => r !== role),
                      )
                    }
                  />
                  {role === 'admin' ? 'Admins' : role === 'manager' ? 'Managers / HR' : 'Employees'}
                </label>
              ))}
            </fieldset>
            <div className="ai-settings-section ai-settings-section-tight">
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={writes}
                  disabled={busy}
                  onChange={(e) => setWrites(e.target.checked)}
                />
                Allow employee drafts and edits
              </label>
              <p className="hint">
                Each change needs your confirmation. Existing employee permissions always apply.
              </p>
            </div>
            <label className="ai-check">
              <input
                type="checkbox"
                checked={!enabled}
                disabled={busy}
                onChange={(e) => setEnabled(!e.target.checked)}
              />
              Pause AI for this workspace
            </label>
          </div>
        </details>
        {!included && (
          <details className="ai-settings-disclosure">
            <summary>
              <SlidersHorizontal size={16} />
              <span>Usage limits</span>
              <ChevronDown size={16} />
            </summary>
            <div className="ai-settings-section">
              <p className="hint">Optional controls for your connected account.</p>
              <Field
                label="Requests per person, daily"
                type="number"
                min={1}
                max={100}
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
              />
              <Field
                label="Workspace tokens, monthly"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={monthly}
                onChange={(e) => {
                  const value = e.target.value
                  if (/^[\d,]*$/.test(value)) setMonthly(value)
                }}
                onBlur={() => {
                  if (monthly.trim() && Number.isFinite(monthlyValue))
                    setMonthly(format(monthlyValue))
                }}
                hint="Tokens measure text processed by AI. Choose 16,384 to 10,000,000. Limits reset in UTC."
              />
              {!validLimits && (
                <Notice>
                  Use 1 to 100 daily requests and 16,384 to 10,000,000 monthly tokens.
                </Notice>
              )}
              {settings.funding === 'workspace' && (
                <p className="hint">
                  {format(settings.usedTokens)} tokens used this month. {settings.usedToday}{' '}
                  requests used by you today.
                </p>
              )}
            </div>
          </details>
        )}
        <p className="ai-settings-footnote">
          {included
            ? 'Included usage is managed by Rekann. We’ll let you know when you reach a limit.'
            : 'OpenRouter charges your connected account. Rekann’s included balance stays separate.'}
        </p>
      </div>
    </DetailDialog>
  )
}
