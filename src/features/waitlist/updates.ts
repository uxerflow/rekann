export const followUrl = 'https://x.com/rekannapp'

export const updates = [
  {
    id: 'dashboard',
    meta: '25 Sep 2026 · Dashboard design',
    title: 'Your day at a glance',
    summary: 'People, attendance and requests, together on your dashboard.',
    body: 'A look at the Rekann dashboard: see who’s in, review requests and keep your team’s day in view.',
    note: 'This is a design preview. We’re refining the details as we build.',
    image: '/waitlist/dashboard.webp',
    width: 1440,
    height: 1024,
  },
  {
    id: 'getting-started',
    meta: 'Update 01 · Auth and onboarding',
    title: 'Getting started with Rekann',
    summary: 'Signing up, signing in and setting up your profile.',
    body: 'Rekann starts with the basics: create an account, sign in and set up your profile before entering your workspace.',
    note: 'The foundation for everything that comes next.',
    image: '/waitlist/onboarding.png',
    width: 1440,
    height: 936,
  },
] as const
export type Update = (typeof updates)[number]
