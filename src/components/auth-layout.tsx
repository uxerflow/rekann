import type { ReactNode } from 'react'
import { Brand } from './ui'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Brand />
      </header>
      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-heading">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
      <div className="auth-strip" aria-hidden="true" />
    </div>
  )
}
