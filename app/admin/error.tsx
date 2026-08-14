'use client'

import Link from 'next/link'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-lg border border-red-400/25 bg-red-400/[0.06] p-6">
        <AlertTriangle className="size-6 text-red-300" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Admin data could not be loaded</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">The protected surface is still closed. Retry the request or return to the seller dashboard.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn-secondary min-h-10 px-3 text-sm"><RotateCcw className="size-4" /> Retry</button>
          <Link href="/dashboard" className="btn-secondary min-h-10 px-3 text-sm">Back to dashboard</Link>
        </div>
      </div>
    </main>
  )
}
