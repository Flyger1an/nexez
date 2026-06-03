'use client'

import { useState } from 'react'
import { Download, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { createClient } from '../utils/supabase/client'

export function AccountDataControls({ email }: { email: string }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const canDelete = confirmText.trim().toLowerCase() === email.trim().toLowerCase() && !!email

  async function deleteAccount() {
    if (!canDelete) return
    setDeleting(true)
    setMessage('')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error || 'Could not delete account.')
        setDeleting(false)
        return
      }
      // Session is now invalid; sign out client-side and leave.
      const supabase = createClient()
      await supabase.auth.signOut().catch(() => {})
      window.location.href = '/'
    } catch {
      setMessage('Network error deleting account.')
      setDeleting(false)
    }
  }

  return (
    <section className="card !p-5">
      <h2 className="text-xl font-semibold">Your Data</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Export everything we hold for your account, or permanently delete it.
      </p>

      <a
        href="/api/account/export"
        className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 px-4 text-sm text-white hover:bg-white/10"
      >
        <Download className="size-4" /> Export my data (JSON)
      </a>

      <div className="mt-6 rounded-lg border border-red-400/30 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 text-red-300">
          <ShieldAlert className="size-4" />
          <h3 className="text-sm font-semibold">Danger zone</h3>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Deleting your account permanently removes your pages, analytics, negotiations, and API keys. This cannot be
          undone. Type your email <span className="text-zinc-200">{email}</span> to confirm.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={email}
            className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          />
          <button
            type="button"
            disabled={!canDelete || deleting}
            onClick={deleteAccount}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-40"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete account
          </button>
        </div>
        {message ? <p className="mt-2 text-xs text-red-300">{message}</p> : null}
      </div>
    </section>
  )
}
