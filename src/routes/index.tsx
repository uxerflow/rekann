import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-lg text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Rekann</h1>
        <p className="mt-3 text-base text-neutral-600">Lightweight people workspace for small teams.</p>
      </div>
    </main>
  )
}
