'use client'

import { useState } from 'react'
import { Download, ExternalLink, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

export function AccountDataControls({ email }: { email: string }) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [showIdentityCheck, setShowIdentityCheck] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')

  const canDelete = confirmText.trim().toLowerCase() === email.trim().toLowerCase() && !!email

  async function deleteBuyerProfile() {
    if (!canDelete || !password) return
    setDeleting(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setMessageTone('error')
        setMessage('That password could not confirm your identity.')
        setDeleting(false)
        return
      }
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessageTone('error')
        setMessage(data.error || 'Could not delete account.')
        setDeleting(false)
        return
      }
      if (data.sellerRetained) {
        setConfirmText('')
        setPassword('')
        setShowIdentityCheck(false)
        setMessageTone('success')
        setMessage('Buyer profile removed. Your Nexez seller workspace and sign-in were kept.')
        setDeleting(false)
        return
      }

      // Pure buyer accounts have no retained seller workspace, so the auth user
      // is gone and the local session should be cleared before leaving.
      await supabase.auth.signOut().catch(() => {})
      router.replace('/')
      router.refresh()
    } catch {
      setMessageTone('error')
      setMessage('Network error deleting account.')
      setDeleting(false)
    }
  }

  return (
    <section className="card !p-5 sm:!p-6" aria-labelledby="account-data-title">
      <h2 id="account-data-title" className="text-xl font-semibold">Data and account controls</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
        Download a complete, facet-labelled archive or remove only the personal buyer-agent data attached to this login.
      </p>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Complete account archive</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
            Includes buyer, seller, Agent Lab research, and account datasets plus a manifest with exact row counts. If any dataset fails, Nexez stops instead of downloading a partial archive.
          </p>
          <a
            href="/api/account/export"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--fg)] outline-none transition hover:bg-[var(--fill-2)] focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
          >
            <Download className="size-4" aria-hidden="true" /> Download JSON archive
          </a>
        </div>

        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Close the seller workspace</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--fg-muted)]">
            Seller closure requires a reviewed handoff so payment, dispute, tax, and payout records are retained correctly. It is deliberately separate from buyer-data deletion.
          </p>
          <a
            href="/support"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--fg)] outline-none transition hover:bg-[var(--fill-2)] focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
          >
            Request workspace closure <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-red-300">
          <ShieldAlert className="size-4" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Remove personal buyer data</h3>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--fg-muted)]">
          This permanently removes your Nexxi buyer-agent conversations, saved businesses, standing searches, tasks, notifications, and buyer-identifying data. Your Nexez seller workspace, listings, financial records, API keys, and sign-in remain available. Type <span className="font-medium text-[var(--fg)]">{email}</span> to confirm.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="buyer-data-confirmation" className="sr-only">Confirm buyer-data deletion with your email</label>
          <input
            id="buyer-data-confirmation"
            value={confirmText}
            onChange={(e) => {
              setConfirmText(e.target.value)
              setShowIdentityCheck(false)
              setPassword('')
              setMessage('')
            }}
            placeholder={email}
            autoComplete="off"
            className="min-h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted-2)] focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
          />
          <button
            type="button"
            disabled={!canDelete || deleting}
            onClick={() => setShowIdentityCheck(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 text-sm font-medium text-red-200 outline-none transition hover:bg-[var(--danger)]/15 focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Continue to identity check
          </button>
        </div>
        {showIdentityCheck ? (
          <div className="mt-3 rounded-xl border border-[var(--danger)]/25 bg-[var(--surface)] p-3">
            <p className="text-xs leading-5 text-[var(--fg-muted)]">
              Sign in again before buyer data can be removed. If this account uses Google, passkey, or text sign-in, use the login page and return here.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="buyer-data-password" className="sr-only">Account password for deletion confirmation</label>
              <input
                id="buyer-data-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Account password"
                disabled={deleting}
                className="min-h-11 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted-2)] focus-visible:ring-2 focus-visible:ring-[var(--control-focus)]"
              />
              <button
                type="button"
                disabled={!password || deleting}
                onClick={deleteBuyerProfile}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 text-sm font-medium text-red-200 outline-none transition hover:bg-[var(--danger)]/15 focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                {deleting ? 'Removing buyer data…' : 'Confirm password and remove'}
              </button>
            </div>
            <a
              href="/login?next=%2Fdashboard%2Fsettings"
              className="mt-3 inline-flex text-xs font-medium text-[var(--link)] underline underline-offset-4"
            >
              Confirm with another sign-in method
            </a>
          </div>
        ) : null}
        {message ? (
          <p role={messageTone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${messageTone === 'error' ? 'text-red-300' : 'text-[var(--ready)]'}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  )
}
