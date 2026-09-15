import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react'
import { Eye, EyeOff, LoaderCircle, ImagePlus, X, CircleAlert } from 'lucide-react'

export function Brand() {
  return (
    <a href="/" aria-label="Rekann home" className="brand">
      <img src="/brand/rekann.svg" width="114" height="24" alt="Rekann" />
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
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
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
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {props.required && <span className="required"> *</span>}
      </label>
      <input {...props} id={id} aria-describedby={hint ? `${id}-hint` : undefined} />
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
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
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
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
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
}: {
  name: string
  image?: string | null
  large?: boolean
}) {
  return (
    <div className={`avatar ${large ? 'large' : ''}`}>
      {image ? (
        <img src={image} alt="" />
      ) : (
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [error, setError] = useState('')
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
      <label htmlFor={id}>
        {label} <span className="optional">(optional)</span>
      </label>
      <div className="image-picker">
        <Avatar name="" image={value} />
        <div>
          <p className="hint">PNG or JPG, up to 5 MB. Cropped to a square.</p>
          <label className="button secondary small file-button" htmlFor={id}>
            Upload image
            <input
              id={id}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => void read(event.target.files?.[0])}
            />
          </label>
        </div>
        {value && (
          <button
            className="icon-button"
            type="button"
            aria-label="Clear selected image"
            onClick={() => onChange('')}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <Notice>{error}</Notice>
    </div>
  )
}
