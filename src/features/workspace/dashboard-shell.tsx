import { AiWorkspace } from '../ai/ai-workspace'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import type { Bootstrap, WorkspaceDetails } from '../../server/workspaces'
import { Avatar, Brand, mediaUrl, useHydrated } from '../../components/ui'
import { ScrollArea } from '../../components/scroll-area'
import { messageOf, signOut } from '../../lib/api'
import './dashboard.css'
import { DashboardAssistant } from './dashboard-assistant'

export function DashboardShell({
  data,
  viewer,
  view,
  children,
  onUnavailable,
  title,
  hideAssistant = false,
  backHref,
}: {
  data: WorkspaceDetails
  viewer: Bootstrap
  view: string
  children: ReactNode
  onUnavailable: (name: string) => void
  title?: string
  hideAssistant?: boolean
  backHref?: string
}) {
  const hydrated = useHydrated()
  const base = `/w/${data.workspace.slug}`
  const menu = useRef<HTMLDialogElement>(null)
  const assistant = useRef<HTMLDialogElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const assistantTrigger = useRef<HTMLElement | null>(null)
  function openAssistant() {
    if (assistant.current?.open) {
      closeAssistant()
      return
    }
    setAssistantExpanded(false)
    assistantTrigger.current = document.activeElement as HTMLElement
    setAssistantOpen(true)
    if (window.matchMedia('(max-width: 1000px)').matches) assistant.current?.showModal()
    else assistant.current?.show()
  }
  function closeAssistant() {
    assistant.current?.close()
    setAssistantOpen(false)
    assistantTrigger.current?.focus()
  }
  useEffect(() => {
    if (!assistantOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeAssistant()
    }
    // Keep the drawer non-modal on desktop and modal on narrow screens.
    const narrow = window.matchMedia('(max-width: 1000px)')
    const changeMode = () => {
      const dialog = assistant.current
      if (!dialog?.open) return
      dialog.close()
      if (narrow.matches) dialog.showModal()
      else dialog.show()
    }
    document.addEventListener('keydown', onEscape)
    narrow.addEventListener('change', changeMode)
    return () => {
      document.removeEventListener('keydown', onEscape)
      narrow.removeEventListener('change', changeMode)
    }
  }, [assistantOpen])
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('assistantPreview')) {
      openAssistant()
    }
  }, [])
  function nav() {
    return (
      <>
        <div className="dash-sidebar-brand">
          <a href="/" aria-label="Rekann home" className="brand">
            <img src="/dashboard/sidebar-brand.svg" width="93" height="32" alt="Rekann" />
          </a>
          <button
            className="icon-button desktop-collapse"
            aria-label="Collapse sidebar"
            disabled={!hydrated}
            onClick={() => setCollapsed(true)}
          >
            <img src="/dashboard/sidebar-collapse.svg" alt="" />
          </button>
        </div>
        <label className="dash-switcher">
          <Avatar name={data.workspace.name} image={mediaUrl(data.workspace.logoKey)} />
          <select
            aria-label="Switch workspace"
            value={data.workspace.slug}
            onChange={(e) =>
              window.location.assign(
                e.target.value === '__new'
                  ? '/onboarding/company?newWorkspace=true'
                  : `/w/${e.target.value}`,
              )
            }
          >
            {viewer.workspaces.map((w) => (
              <option key={w.id} value={w.slug}>
                {w.name}
              </option>
            ))}
            <option value="__new">Create a workspace</option>
          </select>
        </label>
        <ScrollArea className="dash-nav-scroll">
          <nav aria-label="Workspace navigation">
            {[
              {
                label: '',
                items: [
                  ['Dashboard', 'grid-view', base, 'overview'],
                  ['Rekann AI', 'rekann-assistant', `${base}/ai`, 'ai'],
                  ['Team directory', 'user-group-02', `${base}/team`, 'team'],
                  ['Company', 'building-06', '', 'profile'],
                  ['Daily report', 'analytics-01', '', ''],
                ],
              },
              {
                label: 'TIME',
                items: [
                  ['Attendance', 'clock-01', '', ''],
                  [
                    'Leaves',
                    'calendar-off',
                    data.permissions.admin ? `${base}/leaves` : '',
                    'leaves',
                  ],
                  ['Permissions', 'calendar-clock', '', ''],
                ],
              },
              {
                label: 'PERSONAL',
                items: [
                  ['Documents', 'folder-03', '', ''],
                  ['Payslips', 'dollar-square', '', ''],
                ],
              },
              {
                label: 'MANAGEMENT',
                items: [
                  ['Attendance report', 'file-text', '', ''],
                  ['Review report', 'book-edit', '', ''],
                  ['Approvals', 'note-done', '', ''],
                  ['Announcements', 'megaphone-03', '', ''],
                ],
              },
            ]
              .filter((group) => group.label !== 'MANAGEMENT' || data.permissions.admin)
              .map((group) => (
                <div className="dash-nav-group" key={group.label}>
                  {group.label && <p>{group.label}</p>}
                  <div className="dash-nav-items">
                    {group.items.map(([label, Icon, href, key]) => {
                      const icon = `/dashboard/${Icon}.svg`
                      return href && href !== 'assistant' ? (
                        <a
                          key={String(label)}
                          aria-current={view === key ? 'page' : undefined}
                          href={String(href)}
                        >
                          <img src={icon} width="14" height="14" alt="" />
                          <span>{String(label)}</span>
                        </a>
                      ) : (
                        <button
                          key={String(label)}
                          onClick={() => {
                            menu.current?.close()
                            if (href === 'assistant') openAssistant()
                            else onUnavailable(String(label))
                          }}
                        >
                          <img src={icon} width="14" height="14" alt="" />
                          <span>{String(label)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </nav>
        </ScrollArea>
        <div className="dash-sidebar-footer">
          <a href={`${base}/profile`}>
            <Avatar
              name={`${data.employee.firstName} ${data.employee.lastName}`}
              image={mediaUrl(data.employee.avatarKey)}
            />
            <span>{data.employee.firstName || viewer.user.name}</span>
          </a>
          <button
            className="icon-button"
            aria-label="Sign out"
            disabled={!hydrated}
            onClick={() => void signOut().catch((e) => onUnavailable(messageOf(e)))}
          >
            <LogOut size={16} />
          </button>
          {(data.permissions.admin || data.permissions.invite || data.permissions.remove) && (
            <a className="icon-button" href={`${base}/access`} aria-label="Settings">
              <img src="/dashboard/settings.svg" alt="" />
            </a>
          )}
        </div>
      </>
    )
  }
  return (
    <div
      className={`dash-shell ${collapsed ? 'dash-collapsed' : ''} ${assistantOpen ? 'dash-assistant-open' : ''}`}
    >
      <aside className="dash-sidebar">{nav()}</aside>
      <dialog
        ref={menu}
        className="dash-menu-dialog"
        aria-label="Workspace menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) menu.current?.close()
        }}
      >
        <aside>
          {nav()}
          <button
            className="dash-mobile-close icon-button"
            aria-label="Close menu"
            onClick={() => menu.current?.close()}
          >
            <img src="/dashboard/close.svg" alt="" />
          </button>
        </aside>
      </dialog>
      <div className="dash-body">
        <header className="dash-topbar">
          <div className="dash-desktop-title">
            {collapsed && (
              <button
                className="icon-button"
                aria-label="Expand sidebar"
                disabled={!hydrated}
                onClick={() => setCollapsed(false)}
              >
                <img src="/dashboard/sidebar-collapse.svg" alt="" />
              </button>
            )}
            <>
              {backHref ? (
                <a href={backHref} className="icon-button" aria-label="Back to directory">
                  <ArrowLeft size={14} />
                </a>
              ) : (
                <img
                  src={
                    view === 'leaves' ? '/dashboard/calendar-off.svg' : '/dashboard/header-grid.svg'
                  }
                  width="14"
                  height="14"
                  alt=""
                />
              )}
            </>
            <span>
              {title ??
                (view === 'leaves'
                  ? 'Leaves'
                  : view === 'ai'
                    ? 'Rekann AI'
                    : view === 'overview'
                      ? 'Dashboard'
                      : view === 'team'
                        ? 'Team directory'
                        : 'Settings')}
            </span>
          </div>
          <button
            className="dash-mobile-only icon-button"
            aria-label="Open menu"
            disabled={!hydrated}
            onClick={() => menu.current?.showModal()}
          >
            <img src="/dashboard/menu.svg" alt="" />
          </button>
          <div className="dash-mobile-only">
            <Brand />
          </div>
          <div className="dash-top-actions">
            <span className="dash-timezone">
              <img src="/dashboard/header-time.svg" width="16" height="16" alt="" />
              <WorkspaceClock timeZone={data.workspace.timeZone} />
              <span>{data.workspace.timeZone.replaceAll('_', ' ')}</span>
            </span>
            <button
              className="icon-button dash-notifications"
              aria-label="Notifications"
              disabled={!hydrated}
              onClick={() => onUnavailable('Notifications')}
            >
              <img src="/dashboard/notifications.svg" alt="" />
            </button>
            {!hideAssistant && view !== 'ai' && (
              <button
                className="dash-assistant-trigger"
                aria-label="Open Assistant"
                aria-expanded={assistantOpen}
                aria-controls="workspace-assistant"
                disabled={!hydrated}
                onClick={() => openAssistant()}
              >
                <img src="/dashboard/assistant-logo.svg" alt="" />
                <span>Assistant</span>
              </button>
            )}
          </div>
        </header>
        <main
          className={
            view === 'leaves'
              ? 'leaves-main'
              : view === 'overview'
                ? 'dash-main'
                : view === 'ai'
                  ? 'ai-main'
                  : view === 'team'
                    ? 'directory-main'
                    : 'workspace-main'
          }
        >
          {children}
        </main>
      </div>
      <dialog
        ref={assistant}
        id="workspace-assistant"
        className={`dash-assistant-dialog ${assistantExpanded ? 'assistant-expanded' : ''}`}
        aria-labelledby="assistant-title"
        onCancel={(event) => {
          event.preventDefault()
          closeAssistant()
        }}
      >
        {assistantOpen &&
          (import.meta.env.DEV && new URLSearchParams(location.search).has('assistantPreview') ? (
            <DashboardAssistant
              key={data.workspace.id}
              open={assistantOpen}
              expanded={assistantExpanded}
              onExpand={() => setAssistantExpanded(!assistantExpanded)}
              onClose={closeAssistant}
            />
          ) : (
            <AiWorkspace
              key={data.workspace.id}
              workspaceId={data.workspace.id}
              slug={data.workspace.slug}
              name={data.employee.firstName}
              compact
              onClose={closeAssistant}
            />
          ))}
      </dialog>
    </div>
  )
}

export function WorkspaceClock({ timeZone }: { timeZone: string }) {
  const [time, setTime] = useState('—')
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const update = () => setTime(format.format(new Date()))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [timeZone])
  return <time aria-label="Workspace local time">{time}</time>
}
