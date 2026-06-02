'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2, LockKeyhole } from 'lucide-react'
import { createClient } from '../../utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const supabase = createClient()
    const auth =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })

    setLoading(false)

    if (auth.error) {
      setMessage(auth.error.message)
      return
    }

    if (mode === 'signup' && !auth.data.session) {
      setMessage('Check your email to confirm your account, then sign in.')
      return
    }

    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'
    window.location.href = next
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <a href="/" className="mb-10 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" />
          Home
        </a>

        <div className="card !p-6">
          <div className="mb-6 flex size-11 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200">
            <LockKeyhole className="size-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {mode === 'signin' ? 'Sign in to Nexez' : 'Create your Nexez account'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Save agent pages to your account and manage only the pages you own.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                placeholder="At least 6 characters"
                required
              />
            </label>

            {message ? (
              <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setMessage('')
            }}
            className="mt-5 text-sm text-cyan-200 hover:text-cyan-100"
          >
            {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </main>
  )
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-cyan-300/60'
