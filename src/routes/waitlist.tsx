import { createFileRoute } from '@tanstack/react-router'
import { Waitlist } from '../features/waitlist/waitlist'
import { waitlistHead } from '../features/waitlist/meta'
export const Route = createFileRoute('/waitlist')({
  component: Waitlist,
  head: () => waitlistHead(),
})
