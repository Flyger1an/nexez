'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Check, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { browserSupportsPasskeys, passkeyErrorMessage } from '../lib/passkeys'
import { createClient } from '../utils/supabase/client'

type Passkey = {
  id: string
  friendly_name?: string
  created_at: string
  last_used_at?: string
}

const passkeyDateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatPasskeyDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : passkeyDateFormatter.format(date)
}

export function PasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [passkeysSupported, setPasskeysSupported] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'ok' | 'error'>('ok')

  useEffect(() => {
    let active = true
    setPasskeysSupported(browserSupportsPasskeys())

    async function loadPasskeys() {
      try {
        const { data, error } = await createClient().auth.passkey.list()
        if (!active) return
        if (error) {
          setMessageTone('error')
          setMessage(passkeyErrorMessage(error, 'Nexez could not load your passkeys.'))
          return
        }
        setPasskeys((data ?? []) as Passkey[])
      } catch (error) {
        if (!active) return
        setMessageTone('error')
        setMessage(passkeyErrorMessage(error, 'Nexez could not load your passkeys.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadPasskeys()
    return () => {
      active = false
    }
  }, [])

  function showSuccess(nextMessage: string) {
    setMessageTone('ok')
    setMessage(nextMessage)
  }

  function showError(error: unknown, fallback: string) {
    setMessageTone('error')
    setMessage(passkeyErrorMessage(error, fallback))
  }

  async function registerPasskey() {
    if (registering || busyId || !passkeysSupported) return
    setRegistering(true)
    setMessage('')

    try {
      const { data, error } = await createClient().auth.registerPasskey()
      if (error) {
        showError(error, 'Nexez could not add that passkey.')
        return
      }
      if (data) setPasskeys((current) => [data as Passkey, ...current])
      showSuccess('Passkey added. You can now use it from the Nexez login screen.')
    } catch (error) {
      showError(error, 'Nexez could not add that passkey.')
    } finally {
      setRegistering(false)
    }
  }

  function beginRename(passkey: Passkey) {
    setEditingId(passkey.id)
    setRemoveConfirmId(null)
    setDraftName(passkey.friendly_name?.trim() || 'Passkey')
    setMessage('')
  }

  async function renamePasskey(event: FormEvent<HTMLFormElement>, passkeyId: string) {
    event.preventDefault()
    const friendlyName = draftName.trim()
    if (!friendlyName || busyId || registering) return
    setBusyId(passkeyId)
    setMessage('')

    try {
      const { data, error } = await createClient().auth.passkey.update({ passkeyId, friendlyName })
      if (error) {
        showError(error, 'Nexez could not rename that passkey.')
        return
      }
      setPasskeys((current) =>
        current.map((passkey) =>
          passkey.id === passkeyId ? { ...passkey, ...(data as Passkey | null), friendly_name: friendlyName } : passkey,
        ),
      )
      setEditingId(null)
      setDraftName('')
      showSuccess('Passkey renamed.')
    } catch (error) {
      showError(error, 'Nexez could not rename that passkey.')
    } finally {
      setBusyId(null)
    }
  }

  async function removePasskey(passkeyId: string) {
    if (busyId || registering) return
    setBusyId(passkeyId)
    setMessage('')

    try {
      const { error } = await createClient().auth.passkey.delete({ passkeyId })
      if (error) {
        showError(error, 'Nexez could not remove that passkey.')
        return
      }
      setPasskeys((current) => current.filter((passkey) => passkey.id !== passkeyId))
      setRemoveConfirmId(null)
      if (editingId === passkeyId) setEditingId(null)
      showSuccess('Passkey removed.')
    } catch (error) {
      showError(error, 'Nexez could not remove that passkey.')
    } finally {
      setBusyId(null)
    }
  }

  const actionBusy = registering || busyId !== null

  return (
    <section className="card !p-5" aria-labelledby="passkey-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[var(--ready)]" />
            <h2 id="passkey-settings-title" className="text-xl font-semibold">
              Passkeys
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
            Sign in with Face ID, Touch ID, Windows Hello, a device PIN, or a security key. Keep another sign-in method as a backup.
          </p>
        </div>
        <button
          type="button"
          onClick={registerPasskey}
          disabled={loading || actionBusy || !passkeysSupported}
          title={!loading && !passkeysSupported ? 'Passkeys are not supported by this browser.' : undefined}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {registering ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add passkey
        </button>
      </div>

      {!loading && !passkeysSupported ? (
        <p className="mt-4 rounded-lg border border-amber-300/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
          This browser cannot create passkeys. You can still rename or remove passkeys already on your account.
        </p>
      ) : null}

      <div className="mt-5" aria-busy={loading ? 'true' : undefined}>
        {loading ? (
          <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading passkeys…
          </div>
        ) : passkeys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <KeyRound className="size-4 text-[var(--signal)]" /> No passkeys added yet
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Add one while signed in, then choose “Continue with a passkey” the next time you log in.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Registered passkeys">
            {passkeys.map((passkey) => {
              const created = formatPasskeyDate(passkey.created_at)
              const lastUsed = formatPasskeyDate(passkey.last_used_at)
              const isBusy = busyId === passkey.id

              return (
                <li key={passkey.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                  {editingId === passkey.id ? (
                    <form onSubmit={(event) => renamePasskey(event, passkey.id)} className="flex flex-col gap-2 sm:flex-row">
                      <label className="sr-only" htmlFor={`passkey-name-${passkey.id}`}>
                        Passkey name
                      </label>
                      <input
                        id={`passkey-name-${passkey.id}`}
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        maxLength={120}
                        autoFocus
                        disabled={isBusy}
                        className="min-h-[40px] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[var(--signal)]/60"
                      />
                      <button
                        type="submit"
                        disabled={isBusy || !draftName.trim()}
                        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-zinc-950 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={isBusy}
                        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                      >
                        <X className="size-4" /> Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{passkey.friendly_name?.trim() || 'Passkey'}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {created ? `Added ${created}` : 'Registered passkey'}
                          {lastUsed ? ` · Last used ${lastUsed}` : ' · Not used yet'}
                        </p>
                      </div>

                      {removeConfirmId === passkey.id ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="text-xs text-red-200">Remove this passkey?</span>
                          <button
                            type="button"
                            onClick={() => setRemoveConfirmId(null)}
                            disabled={isBusy}
                            className="min-h-[36px] rounded-lg border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => removePasskey(passkey.id)}
                            disabled={isBusy}
                            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => beginRename(passkey)}
                            disabled={actionBusy}
                            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                          >
                            <Pencil className="size-3.5" /> Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null)
                              setRemoveConfirmId(passkey.id)
                              setMessage('')
                            }}
                            disabled={actionBusy}
                            className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {message ? (
        <p
          role={messageTone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${messageTone === 'error' ? 'text-red-300' : 'text-[var(--ready)]'}`}
        >
          {message}
        </p>
      ) : null}
    </section>
  )
}
