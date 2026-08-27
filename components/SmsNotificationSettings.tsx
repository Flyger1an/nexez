'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellRing, CheckCircle2, Loader2, MessageSquareText, ShieldCheck, XCircle } from 'lucide-react'
import {
  SMS_CONSENT_CORE_COPY,
  SMS_PUBLIC_DISCLOSURE_PATH,
} from '../lib/sms-consent'

type SmsStatus = {
  available: boolean
  verificationAvailable: boolean
  messagingAvailable: boolean
  enabled: boolean
  destination: { phoneMasked: string; verifiedAt: string | null } | null
  subscription: { consentedAt: string | null; optedInAt: string | null; optedOutAt: string | null } | null
}

type ApiResponse = SmsStatus & { error?: string; verificationRequired?: boolean }

const inputClass =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--fill-1)] px-3 py-2 text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none transition focus:border-[var(--signal)]/60 focus:ring-2 focus:ring-[var(--signal)]/15'

/**
 * Account-owned transactional SMS preferences. The server owns every state
 * transition; this component never talks to Twilio or Supabase directly.
 */
export function SmsNotificationSettings() {
  const [status, setStatus] = useState<SmsStatus | null>(null)
  const [phone, setPhone] = useState('')
  const [pendingPhone, setPendingPhone] = useState('')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'start' | 'verify' | 'disable' | null>(null)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/sms', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as ApiResponse | null
      if (!res.ok || !data) {
        setTone('err')
        setMessage(data?.error || 'Could not load SMS notification settings.')
        return
      }
      setStatus(data)
    } catch {
      setTone('err')
      setMessage('Could not load SMS notification settings.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function request(action: 'start' | 'verify' | 'disable') {
    setBusy(action)
    setMessage('')
    try {
      const body =
        action === 'start'
          ? { action, phone, consent }
          : action === 'verify'
            ? { action, phone: pendingPhone, code }
            : { action }
      const res = await fetch('/api/account/sms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as ApiResponse | null
      if (!res.ok || !data) {
        setTone('err')
        setMessage(data?.error || 'Could not update SMS notifications.')
        return
      }
      setStatus(data)
      setTone('ok')
      if (action === 'start') {
        setCode('')
        setPendingPhone(phone.trim())
        setMessage('Verification code sent. Enter it below to enable alerts.')
      } else if (action === 'verify') {
        setPhone('')
        setPendingPhone('')
        setCode('')
        setConsent(false)
        setMessage('SMS notifications are enabled for this verified number.')
      } else {
        setPendingPhone('')
        setCode('')
        setConsent(false)
        setMessage('SMS notifications are turned off. We will not send further alerts to this number.')
      }
    } catch {
      setTone('err')
      setMessage('Network error updating SMS notifications.')
    } finally {
      setBusy(null)
    }
  }

  const configured = Boolean(status?.available)
  const verificationPending = Boolean(pendingPhone)

  return (
    <section className="card !border-[var(--signal)]/35 !p-5 sm:!p-6" aria-labelledby="sms-notifications-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-5 text-[var(--signal)]" />
            <h2 id="sms-notifications-heading" className="text-xl font-semibold">
              SMS notifications
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">
            Receive a text when a new negotiation needs your review. Messages only link back to your signed-in Nexez dashboard;
            they never approve or change a deal.
          </p>
        </div>
        {status?.enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ready)]/35 bg-[var(--ready)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ready)]">
            <CheckCircle2 className="size-3.5" /> Enabled
          </span>
        ) : null}
      </div>

      {status === null ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
          <Loader2 className="size-4 animate-spin" /> Loading notification settings...
        </div>
      ) : !configured ? (
        <div className="mt-5 rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] p-4 text-sm leading-6 text-[var(--fg-muted)]">
          SMS delivery is not configured on this deployment yet. Your existing email, push, and dashboard notifications remain active.
        </div>
      ) : status.enabled && status.destination ? (
        <div className="mt-5 rounded-xl border border-[var(--ready)]/25 bg-[var(--ready)]/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--ready)]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--fg)]">Verified number: {status.destination.phoneMasked}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
                Seller negotiation alerts are enabled. Reply STOP to opt out at any time.
              </p>
              <button
                type="button"
                onClick={() => void request('disable')}
                disabled={busy !== null}
                className="mt-3 inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-red-400/35 px-3 text-sm font-medium text-red-200 hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === 'disable' ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                Turn off SMS
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--fg)]">Mobile number</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+14155550123"
              disabled={busy !== null}
              className={inputClass}
              aria-describedby="sms-phone-help"
            />
            <span id="sms-phone-help" className="mt-1 block text-xs leading-5 text-[var(--fg-muted)]">
              Use E.164 format (for example, +14155550123). We verify it before enabling notifications.
            </span>
          </label>

          {!verificationPending ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--signal)]/35 bg-[var(--signal)]/5 p-4 text-sm leading-6 text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={busy !== null}
                className="mt-0.5 size-4 accent-[var(--signal)]"
              />
              <span>
                {SMS_CONSENT_CORE_COPY}{' '}
                See our <a className="font-semibold underline underline-offset-4 hover:text-[var(--fg)]" href="/terms">Terms</a> and{' '}
                <a className="font-semibold underline underline-offset-4 hover:text-[var(--fg)]" href="/privacy">Privacy Policy</a>.
              </span>
            </label>
          ) : (
            <div className="rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/5 p-3 text-sm leading-6 text-[var(--amber)]">
              A verification code is waiting for this number. Enter it below before SMS can be enabled.
            </div>
          )}

          {verificationPending ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm">
                <span className="mb-1 block text-[var(--fg)]">Verification code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="123456"
                  disabled={busy !== null}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => void request('verify')}
                disabled={busy !== null || code.trim().length < 4}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
              >
                {busy === 'verify' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Verify number
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void request('start')}
              disabled={busy !== null || !phone.trim() || !consent || !status.verificationAvailable}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
            >
              {busy === 'start' ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
              Send verification code
            </button>
          )}

          <p className="text-xs leading-5 text-[var(--fg-muted)]">
            Read the complete, public opt-in workflow at{' '}
            <a className="font-semibold text-[var(--signal)] hover:underline" href={SMS_PUBLIC_DISCLOSURE_PATH}>
              nexez.ai{SMS_PUBLIC_DISCLOSURE_PATH}
            </a>.
          </p>
        </div>
      )}

      {message ? (
        <p role="status" className={`mt-4 text-sm ${tone === 'ok' ? 'text-[var(--ready)]' : 'text-red-300'}`}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
