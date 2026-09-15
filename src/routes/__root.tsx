import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import stylesheet from '../styles.css?url'
import { Loading } from '../components/ui'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Rekann' },
      { name: 'description', content: 'Lightweight people workspace for small teams.' },
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }],
  }),
  component: () => <Outlet />,
  pendingComponent: Loading,
  errorComponent: () => (
    <main className="empty-state">
      <h1>Unable to load this page</h1>
      <p>Please try again in a moment.</p>
      <a className="button secondary" href="/">
        Try again
      </a>
    </main>
  ),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <main className="empty-state">
      <h1>Page not found</h1>
      <p>The page you’re looking for is no longer available.</p>
      <a href="/">Back to home</a>
    </main>
  ),
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
