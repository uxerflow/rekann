import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
import { EyeOff, LoaderCircle, ImagePlus, X, CircleAlert } from 'lucide-react'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" aria-label="Rekann home" className="brand">
      <img
        src={compact ? '/brand/rekann-compact.svg' : '/brand/rekann.svg'}
        width={compact ? 77 : 114}
        height={compact ? 20 : 24}
        alt="Rekann"
      />
    </a>
  )
}
export function useHydrated() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready
}
export function FormFields({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  const ready = useHydrated()
  return (
    <fieldset className="form-stack form-fields" disabled={!ready || busy}>
      {children}
    </fieldset>
  )
}
export function Button({
  busy,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  const ready = useHydrated()
  return (
    <button
      {...props}
      disabled={!ready || props.disabled || busy}
      className={`button ${className}`}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
export function Notice({ children, success = false }: { children?: ReactNode; success?: boolean }) {
  return children ? (
    <div className={`notice ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>
      <CircleAlert size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  ) : null
}
export function Field({
  label,
  hint,
  compact = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; compact?: boolean }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {label}
        {props.required && <span className="required"> *</span>}
      </label>
      <div className="input-wrap">
        {compact && <img src="/icons/mail.svg" alt="" className="input-icon" />}
        <input {...props} id={id} aria-describedby={hint ? `${id}-hint` : undefined} />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  )
}
export function PasswordField({
  label = 'Password',
  hint,
  compact = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; compact?: boolean }) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className="password-field">
        {compact && <img src="/icons/password.svg" alt="" className="input-icon" />}
        <input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={16} />
          ) : (
            <img src="/icons/eye.svg" width="16" height="16" alt="" />
          )}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  )
}
export function Loading({ text = 'Loading your workspace…' }: { text?: string }) {
  return (
    <main className="loading-page">
      <LoaderCircle className="spin" size={24} aria-hidden="true" />
      <p role="status">{text}</p>
    </main>
  )
}
export function Avatar({
  name,
  image,
  large = false,
  placeholder = false,
}: {
  name: string
  image?: string | null
  large?: boolean
  placeholder?: boolean
}) {
  return (
    <div className={`avatar ${large ? 'large' : ''}`}>
      {image ? (
        <img src={image} alt="" />
      ) : placeholder ? null : (
        <span>
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join('')
            .toUpperCase() || <ImagePlus size={large ? 28 : 18} />}
        </span>
      )}
    </div>
  )
}
export function mediaUrl(key?: string | null) {
  return key ? `/api/app/media?key=${encodeURIComponent(key)}` : undefined
}
export function ImagePicker({
  label,
  value,
  onChange,
  avatarName,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  avatarName?: string
}) {
  const id = useId()
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const colors = [
    '#1da578',
    '#5078b8',
    '#9b68a8',
    '#c07f3e',
    '#377e85',
    '#b86471',
    '#68734a',
    '#555d75',
  ]
  function chooseAvatar(color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 320
    const context = canvas.getContext('2d')!
    context.fillStyle = color
    context.fillRect(0, 0, 320, 320)
    context.fillStyle = '#fff'
    context.font = '500 120px Inter'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(
      (avatarName || 'You')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((v) => v[0])
        .join('')
        .toUpperCase(),
      160,
      166,
    )
    onChange(canvas.toDataURL('image/png'))
    dialog.current?.close()
  }
  async function read(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5_000_000) {
      setError('Choose a PNG or JPEG image smaller than 5 MB.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      if (bitmap.width > 12_000 || bitmap.height > 12_000) {
        bitmap.close()
        throw new Error('Image dimensions are too large.')
      }
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 320
      const context = canvas.getContext('2d')!
      const side = Math.min(bitmap.width, bitmap.height)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 320, 320)
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        320,
        320,
      )
      bitmap.close()
      onChange(canvas.toDataURL('image/jpeg', 0.85))
      setError('')
    } catch {
      setError('Unable to read this image. Please choose another file.')
    }
  }
  return (
    <div className="field">
      <label htmlFor={id} className="image-picker-label">
        {label}
      </label>
      <div className="image-picker">
        <Avatar name="" image={value} placeholder />
        <div>
          <p className="hint">100 × 100px recommended. PNG or JPG format.</p>
          <div className="image-picker-actions">
            {avatarName !== undefined && (
              <Button
                className="secondary small"
                type="button"
                onClick={() => dialog.current?.showModal()}
              >
                Choose avatar
              </Button>
            )}
            <label className="button secondary small file-button" htmlFor={id}>
              {label === 'Company logo' ? 'Upload logo' : 'Upload image'}
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => void read(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        {value && (
          <button
            className="icon-button clear-image"
            type="button"
            aria-label="Clear selected image"
            onClick={() => onChange('')}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <Notice>{error}</Notice>
      {avatarName !== undefined && (
        <dialog
          ref={dialog}
          className="avatar-dialog"
          aria-labelledby={`${id}-avatar-title`}
          onClick={(event) => {
            if (event.target === event.currentTarget) dialog.current?.close()
          }}
        >
          <h2 id={`${id}-avatar-title`}>Choose an avatar</h2>
          <div className="avatar-options">
            {colors.map((color, index) => (
              <button
                key={color}
                type="button"
                className="avatar-option"
                style={{ background: color, color: '#fff' }}
                aria-label={`Choose avatar ${index + 1}`}
                onClick={() => chooseAvatar(color)}
              >
                {(avatarName || 'You')
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((v) => v[0])
                  .join('')
                  .toUpperCase()}
              </button>
            ))}
          </div>
          <Button type="button" className="secondary small" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
        </dialog>
      )}
    </div>
  )
}

export function OtpInput({
  value,
  onChange,
  invalid = false,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const [cursor, setCursor] = useState(value.length)
  return (
    <div className={`otp-control ${invalid ? 'invalid' : ''}`}>
      <div className="otp-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} style={{ display: 'contents' }}>
            {index === 3 && <span className="otp-divider" />}
            <span className={`otp-slot ${index === Math.min(cursor, 5) ? 'current' : ''}`}>
              {value[index]}
            </span>
          </span>
        ))}
      </div>
      <input
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        minLength={6}
        required
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(next)
          setCursor(next.length)
        }}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? value.length)}
        autoFocus
        aria-label="6-digit verification code"
        aria-invalid={invalid || undefined}
      />
    </div>
  )
}
