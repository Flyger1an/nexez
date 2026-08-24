'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { NexezLogo } from '../NexezLogo'
import { safeNextPath } from '../../lib/safe-redirect'
import { createClient } from '../../utils/supabase/client'

export function AdminLoginForm({
  nextPath,
  initialError,
  clearExistingSession = false,
}: {
  nextPath?: string
  initialError?: string
  clearExistingSession?: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [message, setMessage] = useState(initialError ?? '')

  useEffect(() => {
    if (!clearExistingSession) return
    void createClient().auth.signOut()
  }, [clearExistingSession])

  async function verifyAdminSession() {
    const response = await fetch('/api/admin/session', { cache: 'no-store' })
    if (response.ok) return true
    const body = await response.json().catch(() => ({})) as { error?: string }
    setMessage(body.error || 'This account does not have platform-admin access.')
    return false
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || googleLoading) return
    setLoading(true)
    setMessage('')
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setMessage(error.message)
        return
      }
      if (!(await verifyAdminSession())) return
      window.location.assign(safeNextPath(nextPath, '/admin'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (loading || googleLoading) return
    setGoogleLoading(true)
    setMessage('')
    const callback = new URL('/auth/callback', window.location.origin)
    callback.searchParams.set('next', safeNextPath(nextPath, '/admin'))
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    if (error) {
      setMessage(error.message)
      setGoogleLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08090c] px-4 py-12 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,101,46,.12),transparent_34%),radial-gradient(circle_at_78%_74%,rgba(87,230,211,.08),transparent_30%)]" />
      <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#111217]/95 shadow-2xl shadow-black/50">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-white text-black"><NexezLogo className="size-7" /></span><div><p className="text-sm font-semibold">Nexez Admin</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Platform operations</p></div></div>
            <ShieldCheck className="size-5 text-[#57e6d3]" />
          </div>
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex size-11 items-center justify-center rounded-xl border border-[#ff652e]/30 bg-[#ff652e]/10 text-[#ff7d50]"><KeyRound className="size-5" /></div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Sign in to platform operations</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">This workspace is separate from merchant accounts and restricted to approved Nexez operators.</p>

          <button type="button" onClick={handleGoogle} disabled={loading || googleLoading} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] text-sm font-medium transition hover:bg-white/[0.08] disabled:opacity-60">
            {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <span className="font-semibold">G</span>} Continue with Google
          </button>
          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-white/35"><span className="h-px flex-1 bg-white/10" /> or use email <span className="h-px flex-1 bg-white/10" /></div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block"><span className="text-xs font-medium text-white/65">Admin email</span><span className="mt-2 flex h-11 items-center gap-3 rounded-lg border border-white/12 bg-black/20 px-3 focus-within:border-[#ff652e]/70"><Mail className="size-4 text-white/35" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" placeholder="operator@nexez.ai" /></span></label>
            <label className="block"><span className="text-xs font-medium text-white/65">Password</span><span className="mt-2 flex h-11 items-center gap-3 rounded-lg border border-white/12 bg-black/20 px-3 focus-within:border-[#ff652e]/70"><LockKeyhole className="size-4 text-white/35" /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/25" placeholder="Your password" /></span></label>
            {message ? <p className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-xs leading-5 text-red-200" role="alert">{message}</p> : null}
            <button type="submit" disabled={loading || googleLoading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ff652e] text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60">{loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} {loading ? 'Verifying access...' : 'Enter admin workspace'}</button>
          </form>
          <p className="mt-5 text-center text-[11px] leading-5 text-white/35">Need access restored? Contact support@nexez.ai from your approved operator email.</p>
        </div>
      </section>
    </main>
  )
}
