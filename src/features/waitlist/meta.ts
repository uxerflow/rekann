export function waitlistHead(indexable = false) {
  return {
    meta: [
      { title: 'Rekann — Everything your team needs. One HR workspace.' },
      {
        name: 'description',
        content:
          'AI-powered HR workspace for modern teams. Bring your people, attendance and time off together. Join the Rekann waitlist.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Rekann' },
      { property: 'og:title', content: 'Everything your team needs. One HR workspace.' },
      {
        property: 'og:description',
        content: 'AI-powered HR workspace for modern teams. Join the waitlist.',
      },
      { property: 'og:url', content: 'https://rekann.app/' },
      { property: 'og:image', content: 'https://rekann.app/waitlist/og.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Rekann — AI-powered HR workspace for modern teams.' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@rekannapp' },
      { name: 'twitter:image', content: 'https://rekann.app/waitlist/og.png' },
      ...(!indexable ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ],
    links: [{ rel: 'canonical', href: 'https://rekann.app/' }],
  }
}
