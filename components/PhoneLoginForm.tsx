'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, MessageSquareText, Phone } from 'lucide-react'
import { maskE164PhoneNumber, normalizeE164PhoneNumber, normalizePhoneOtp } from '../lib/phone-auth'
import { createClient } from '../utils/supabase/client'

type PhoneLoginFormProps = {
  disabled?: boolean
  onAuthenticated: () => void
  onBusyChange?: (busy: boolean) => void
}

const SEND_ERROR = 'We could not send a code. Confirm this number is linked to your Nexez account, then try again.'
const VERIFY_ERROR = 'That code could not be verified. Check the code and try again.'

export function PhoneLoginForm({ disabled = false, onAuthenticated, onBusyChange }: PhoneLoginFormProps) {
  const [expanded, setExpanded] = useState(false)
  const [phone, setPhone] = useState('')
  const [verificationPhone, setVerificationPhone] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('info')
  const [resendAfter, setResendAfter] = useState(0)

  useEffect(() => {
    if (resendAfter <= 0) return
    const timer = window.setInterval(() => setResendAfter((seconds) => Math.max(0, seconds - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [resendAfter])

  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  function updateBusy(nextBusy: boolean) {
    setBusy(nextBusy)
    onBusyChange?.(nextBusy)
  }

  function showError(nextMessage: string) {
    setMessageTone('error')
    setMessage(nextMessage)
  }

  function showInfo(nextMessage: string) {
    setMessageTone('info')
    setMessage(nextMessage)
  }

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy || disabled) return

    const normalizedPhone = normalizeE164PhoneNumber(verificationPhone ?? phone)
    if (!normalizedPhone) {
      showError('Enter a mobile number in international format, such as +17627445455.')
      return
    }

    updateBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/phone/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      })
      if (!response.ok) {
        showError(SEND_ERROR)
        return
      }

      setVerificationPhone(normalizedPhone)
      setCode('')
      setResendAfter(60)
      showInfo(`If this number is linked, a sign-in code is on its way to ${maskE164PhoneNumber(normalizedPhone)}.`)
    } catch {
      showError(SEND_ERROR)
    } finally {
      updateBusy(false)
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || disabled || !verificationPhone) return

    const normalizedCode = normalizePhoneOtp(code)
    if (!normalizedCode) {
      showError('Enter the numeric code from your text message.')
      return
    }

    updateBusy(true)
    setMessage('')
    try {
      const { error } = await createClient().auth.verifyOtp({
        phone: verificationPhone,
        token: normalizedCode,
        type: 'sms',
      })
      if (error) {
        showError(VERIFY_ERROR)
        return
      }
      onAuthenticated()
    } catch {
      showError(VERIFY_ERROR)
    } finally {
      updateBusy(false)
    }
  }

  function changeNumber() {
    if (busy) return
    setVerificationPhone(null)
    setCode('')
    setResendAfter(0)
    setMessage('')
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={disabled}
        className="nx-auth-oauth"
      >
        <Phone className="size-[18px]" />
        Continue with phone
      </button>
    )
  }

  return (
    <div className="rounded-[18px] border border-[var(--nx-auth-signal)]/35 bg-[var(--nx-auth-signal)]/[0.055] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nx-auth-signal)]/15 text-[var(--nx-auth-signal)]">
          <MessageSquareText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--nx-auth-text)]">Sign in by text</p>
          <p className="mt-1 text-xs leading-5 text-[var(--nx-auth-muted)]">
            Available only after you verify a login phone in Account Settings.
          </p>
        </div>
      </div>

      {verificationPhone ? (
        <form onSubmit={verifyCode} className="mt-4 space-y-3">
          <label className="nx-auth-field">
            <span>Verification code</span>
            <input
              name="phoneCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="nx-auth-input tracking-[0.2em]"
              placeholder="123456"
              maxLength={12}
              disabled={disabled || busy}
              autoFocus
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={disabled || busy} className="nx-auth-submit flex-1">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify and sign in
            </button>
            <button
              type="button"
              onClick={changeNumber}
              disabled={disabled || busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-[var(--nx-auth-muted)] outline-none transition hover:bg-white/5 hover:text-[var(--nx-auth-text)] focus-visible:ring-2 focus-visible:ring-[var(--nx-auth-signal)] disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" /> Change number
            </button>
          </div>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={disabled || busy || resendAfter > 0}
            className="text-xs font-medium text-[var(--nx-auth-muted)] underline decoration-white/20 underline-offset-4 hover:text-[var(--nx-auth-text)] disabled:no-underline disabled:opacity-60"
          >
            {resendAfter > 0 ? `Send another code in ${resendAfter}s` : 'Send another code'}
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="mt-4 space-y-3">
          <label className="nx-auth-field">
            <span>Login phone</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="nx-auth-input"
              placeholder="+17627445455"
              disabled={disabled || busy}
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={disabled || busy} className="nx-auth-submit flex-1">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Send sign-in code
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(false)
                setMessage('')
              }}
              disabled={disabled || busy}
              className="min-h-12 rounded-xl px-3 text-xs font-medium text-[var(--nx-auth-muted)] outline-none transition hover:bg-white/5 hover:text-[var(--nx-auth-text)] focus-visible:ring-2 focus-visible:ring-[var(--nx-auth-signal)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {message ? (
        <p
          role={messageTone === 'error' ? 'alert' : 'status'}
          className={`nx-auth-message mt-3 ${messageTone === 'error' ? 'nx-auth-message--error' : 'nx-auth-message--info'}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
