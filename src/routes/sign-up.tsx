import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { AuthScreen } from '../features/auth/auth-screen'
import { safeNext } from '../lib/api'

export const Route = createFileRoute('/sign-up')({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === 'string' ? search.email.slice(0, 254) : '',
    next: safeNext(search.next),
    reset: search.reset === true || search.reset === 'true',
  }),
  search: { middlewares: [stripSearchParams({ email: '', next: '', reset: false })] },
  head: () => ({ meta: [{ title: 'Sign Up · Rekann' }] }),
  component: () => <AuthScreen mode="sign-up" search={Route.useSearch()} />,
})
