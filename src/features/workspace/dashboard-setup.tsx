import { useEffect, useRef } from 'react'

export function WelcomeCard({ open, onStart }: { open: boolean; onStart: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current?.close()
  }, [open])
  return (
    <dialog
      ref={dialog}
      className="dashboard-welcome"
      aria-labelledby="welcome-title"
      onCancel={(e) => {
        e.preventDefault()
        onStart()
      }}
    >
      <div className="welcome-layout">
        <div className="welcome-copy">
          <div>
            <img src="/dashboard/welcome-mark.svg" width="28" height="28" alt="" />
            <h2 id="welcome-title">
              Welcome to
              <br />
              Rekann
            </h2>
          </div>
          <p>
            Manage your team in one place.
            <br />
            Track attendance, manage time off, and review requests.
          </p>
          <button className="button" onClick={onStart}>
            Get started
          </button>
        </div>
        <img
          className="welcome-art"
          src="/dashboard/welcome-art.png"
          width="448"
          height="400"
          alt="A preview of your Rekann workspace"
        />
      </div>
    </dialog>
  )
}

export function SetupChecklist({
  completed,
  onSetup,
  onDismiss,
}: {
  completed: boolean[]
  onSetup: (index: number) => void
  onDismiss: () => void
}) {
  const count = completed.filter(Boolean).length
  return (
    <section className="dashboard-setup dashboard-card">
      <header>
        <div>
          <h2>{count === 3 ? 'Your workspace is ready' : 'Ready to get started?'}</h2>
          <p>
            {count === 3
              ? 'You have completed the setup checklist.'
              : 'Here are a few things that will help you make the most of your workspace'}
          </p>
        </div>
        <span className="setup-progress">
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="#e5e5e5" strokeWidth="3" />
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="#1da578"
              strokeWidth="3"
              pathLength="3"
              strokeDasharray={`${count} 3`}
              transform="rotate(-90 11 11)"
            />
          </svg>
          {count} of 3 complete
        </span>
        <button className="icon-button" aria-label="Dismiss setup checklist" onClick={onDismiss}>
          <img src="/dashboard/close.svg" width="16" height="16" alt="" />
        </button>
      </header>
      <div className="setup-grid">
        {[
          [
            'Complete your company profile',
            'Add your company address and contact information.',
            'company',
          ],
          ['Add your first employee', 'Add an employee to your workspace.', 'employee'],
          [
            'Set up leave policies',
            count === 3
              ? 'Leave types and approval rules are ready.'
              : 'Set up leave types and approval rules.',
            'policy',
          ],
        ].map(([title, description, asset], i) => (
          <article key={title}>
            <img src={`/dashboard/setup-${asset}.svg`} width="24" height="24" alt="" />
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            {completed[i] ? (
              <span className="setup-done">
                <span aria-hidden="true">✓</span> Completed
              </span>
            ) : (
              <button className="dashboard-small-button" onClick={() => onSetup(i)}>
                Set up
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
