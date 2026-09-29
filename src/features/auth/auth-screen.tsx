import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { AuthLayout } from '../../components/auth-layout'
import { Button, Field, FormFields, Notice, PasswordField, OtpInput } from '../../components/ui'
import { authRequest, messageOf, safeNext } from '../../lib/api'

export type AuthMode = 'sign-in' | 'sign-up' | 'verify-email' | 'forgot-password' | 'reset-password'
export function AuthScreen({
  mode,
  search,
}: {
  mode: AuthMode
  search: { email?: string; next?: string; reset?: boolean }
}) {
  const [email, setEmail] = useState(search.email ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    search.reset ? 'Your password has been reset. Sign in with your new password.' : '',
  )
  const [remaining, setRemaining] = useState(
    mode === 'verify-email' || mode === 'reset-password' ? 60 : 0,
  )
  const next = safeNext(search.next)
  const isSignUp = mode === 'sign-up'
  const isVerify = mode === 'verify-email'
  const isReset = mode === 'reset-password'
  const isForgot = mode === 'forgot-password'
  useEffect(() => {
    if (!remaining) return
    const timer = setTimeout(() => setRemaining((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  const titles = {
    'sign-in': 'Welcome to Rekann',
    'sign-up': 'Create your account',
    'verify-email': 'Check your email',
    'forgot-password': 'Forgot your password?',
    'reset-password': 'Reset your password',
  }
  const subtitles = {
    'sign-in': 'Sign in to your Rekann workspace.',
    'sign-up': 'Bring your people together with Rekann.',
    'verify-email': (
      <>
        Enter the 6-digit code sent to
        <br />
        <strong>{email}</strong>
      </>
    ),
    'forgot-password': 'Enter your email and we’ll send you a reset code.',
    'reset-password': (
      <>
        Enter the code sent to <strong>{email}</strong> and choose a new password.
      </>
    ),
  }
  function authUrl(path: string, extra: Record<string, string> = {}) {
    return `${path}?${new URLSearchParams({ ...extra, ...(next ? { next } : {}) }).toString()}`
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if ((isSignUp || isReset) && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (isSignUp) {
        await authRequest('sign-up/email', { email, password, name: email.split('@')[0] })
        window.location.assign(authUrl('/verify-email', { email }))
        return
      }
      if (mode === 'sign-in') {
        await authRequest('sign-in/email', { email, password, rememberMe: true })
        window.location.assign(next || '/')
        return
      }
      if (isVerify) {
        await authRequest('email-otp/verify-email', { email, otp: code })
        window.location.assign(next || '/')
        return
      }
      if (isForgot) {
        await authRequest('email-otp/request-password-reset', { email })
        window.location.assign(authUrl('/reset-password', { email }))
        return
      }
      await authRequest('email-otp/reset-password', { email, otp: code, password })
      window.location.assign(authUrl('/sign-in', { email, reset: 'true' }))
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EMAIL_NOT_VERIFIED'
      ) {
        window.location.assign(authUrl('/verify-email', { email }))
        return
      }
      setError(messageOf(error))
      setBusy(false)
    }
  }
  async function resend() {
    setSending(true)
    setError('')
    setNotice('')
    try {
      await authRequest(
        isReset ? 'email-otp/request-password-reset' : 'email-otp/send-verification-otp',
        isReset ? { email } : { email, type: 'email-verification' },
      )
      setNotice('If this email is eligible, a new code is on its way.')
      setRemaining(60)
    } catch (error) {
      setError(messageOf(error))
    } finally {
      setSending(false)
    }
  }
  return (
    <AuthLayout title={titles[mode]} subtitle={subtitles[mode]}>
      <form onSubmit={submit}>
        <FormFields busy={busy}>
          {!isVerify && <Notice>{error}</Notice>}
          <Notice success>{notice}</Notice>
          {!isVerify && !isReset && (
            <Field
              label="Email address"
              compact
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              placeholder="Work email address"
            />
          )}
          {(isVerify || isReset) && <OtpInput value={code} onChange={setCode} invalid={!!error} />}
          {isVerify && <Notice>{error}</Notice>}
          {!isForgot && !isVerify && (
            <PasswordField
              compact
              label={isReset ? 'New password' : 'Password'}
              placeholder={isReset ? 'New password' : 'Password'}
              required
              minLength={isSignUp || isReset ? 12 : undefined}
              maxLength={128}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={isSignUp || isReset ? 'Use at least 12 characters.' : undefined}
            />
          )}
          {(isSignUp || isReset) && (
            <PasswordField
              compact
              label="Confirm password"
              placeholder="Confirm password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              maxLength={128}
            />
          )}
          {mode === 'sign-in' && (
            <div className="text-right">
              <a href={authUrl('/forgot-password')}>Forgot password?</a>
            </div>
          )}
          <Button type="submit" busy={busy}>
            {isSignUp
              ? 'Create account'
              : isVerify
                ? 'Verify email'
                : isForgot
                  ? 'Send reset code'
                  : isReset
                    ? 'Reset password'
                    : 'Sign in'}
          </Button>
        </FormFields>
      </form>
      {(isVerify || isReset) && (
        <div className="auth-footer">
          <span>Didn’t receive a code? </span>
          <button
            className="text-button"
            onClick={() => void resend()}
            disabled={remaining > 0 || sending || busy}
          >
            {sending ? 'Sending…' : remaining ? `Resend in ${remaining}s` : 'Resend code'}
          </button>
        </div>
      )}
      {isReset && (
        <p className="hint centered">
          If an account exists for this email, you’ll receive a reset code.
        </p>
      )}
      {mode === 'sign-in' && (
        <p className="auth-footer">
          New to Rekann? <a href={authUrl('/sign-up')}>Create an account</a>
        </p>
      )}
      {isSignUp && (
        <p className="auth-footer">
          Already have an account? <a href={authUrl('/sign-in')}>Sign in</a>
        </p>
      )}
      {(isForgot || isReset || isVerify) && (
        <p className="auth-footer">
          <a href={authUrl('/sign-in', { email })}>Back to sign in</a>
        </p>
      )}
      {next && (
        <p className="hint centered">Use the email address that received your invitation.</p>
      )}
    </AuthLayout>
  )
}
