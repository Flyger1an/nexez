'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { NexezLogo } from './NexezLogo'
import { PhoneLoginForm } from './PhoneLoginForm'
import { safeNextPath } from '../lib/safe-redirect'
import { browserSupportsPasskeys, passkeyErrorMessage } from '../lib/passkeys'
import { createClient } from '../utils/supabase/client'

/**
 * Sign in, and nothing else.
 *
 * The previous screen offered four ways in at equal weight, three of them
 * stacked above the email form, plus a Sign in / Start Free tab pair, inside a
 * 470x732 card that filled the viewport. Four equal options read as hesitation.
 *
 * Here there is one form, one primary button, then the alternates ranked below
 * a rule. Signup lives in the top bar and one line at the foot, so a returning
 * user never trips over it. Signup and password reset still belong to
 * LoginForm; this component only ever renders signin.
 */

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  )
}

const inputClass =
  'w-full min-h-[52px] rounded-[12px] border border-white/15 bg-white/[0.03] px-4 text-[15px] text-[var(--fg)] ' +
  'outline-none transition placeholder:text-[var(--fg-muted-2)] focus:border-[var(--signal)] focus:bg-white/[0.05] ' +
  'disabled:opacity-60'

const quietBtnClass =
  'inline-flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[12px] border border-white/15 ' +
  'px-4 text-sm font-medium text-[var(--fg-2)] transition hover:border-white/35 hover:text-[var(--fg)] ' +
  'disabled:opacity-50'

export function SignInForm({ nextPath }: { nextPath?: string }) {
  const [hydrated, setHydrated] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [passkeysSupported, setPasskeysSupported] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('info')

  const busy = loading || oauthLoading || passkeyLoading || phoneBusy
  const onboardingHref = nextPath ? `/onboard?next=${encodeURIComponent(nextPath)}` : '/onboard'
  const resetHref = nextPath ? `/login?mode=reset&next=${encodeURIComponent(nextPath)}` : '/login?mode=reset'

  useEffect(() => {
    setHydrated(true)
    setPasskeysSupported(browserSupportsPasskeys())
  }, [])

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'auth_callback') {
      setMessageTone('error')
      setMessage('That sign-in link is invalid or has expired. Please sign in again.')
    }
  }, [])

  function setError(msg: string) {
    setMessageTone('error')
    setMessage(msg)
  }

  function goNext() {
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next') || nextPath)
    window.location.href = next
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(error.message)
        return
      }
      goNext()
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (busy) return
    setOauthLoading(true)
    setMessage('')
    const supabase = createClient()
    // Preserve the post-auth destination through the OAuth round-trip; the shared
    // /auth/callback exchanges the code and honors ?next (redirect-guarded server side).
    const next = safeNextPath(new URLSearchParams(window.location.search).get('next') || nextPath)
    const callback = new URL('/auth/callback', window.location.origin)
    if (next && next !== '/') callback.searchParams.set('next', next)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    // On success the browser navigates to Google, so leave the button spinning.
    if (error) {
      setError(error.message)
      setOauthLoading(false)
    }
  }

  async function handlePasskey() {
    if (busy || !passkeysSupported) return
    setPasskeyLoading(true)
    setMessage('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPasskey()
      if (error) {
        setError(passkeyErrorMessage(error, 'Nexez could not sign you in with that passkey.'))
        return
      }
      goNext()
    } catch (error) {
      setError(passkeyErrorMessage(error, 'Nexez could not sign you in with that passkey.'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* One soft light source, well above the form, so the page has depth
          without anything competing with the single action. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% -10%, color-mix(in srgb, var(--signal) 13%, transparent), transparent 70%)',
        }}
      />

      <header className="relative z-10 mx-auto flex h-[72px] max-w-6xl items-center gap-4 px-6">
        <a href="/" className="flex items-center gap-2.5 font-display text-[19px] font-bold tracking-[-0.04em]" aria-label="Nexez home">
          <NexezLogo className="size-6" />
          <span>Nexez</span>
        </a>
        <p className="ml-auto text-sm text-muted-foreground">
          New to Nexez?{' '}
          <a href={onboardingHref} className="font-medium text-[var(--fg)] underline decoration-white/25 underline-offset-4 hover:decoration-[var(--signal)]">
            Start free
          </a>
        </p>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-72px)] max-w-6xl items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[380px]">
          <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-[-0.035em]">Sign in</h1>
          <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
            Your listings, offers, and agent traffic in one place.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" data-hydrated={hydrated ? 'true' : 'false'}>
            <div className="space-y-2">
              <label htmlFor="signin-email" className="block text-[13px] font-medium text-[var(--fg-2)]">
                Work email
              </label>
              <input
                id="signin-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                placeholder="you@company.com"
                autoComplete="email"
                disabled={!hydrated || busy}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="signin-password" className="block text-[13px] font-medium text-[var(--fg-2)]">
                  Password
                </label>
                <a href={resetHref} className="text-xs text-muted-foreground transition hover:text-[var(--fg-2)]">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  id="signin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="Your password"
                  autoComplete="current-password"
                  disabled={!hydrated || busy}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  disabled={!hydrated || busy}
                  className="absolute right-2.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/10 hover:text-[var(--fg)] disabled:opacity-50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {message ? (
              <p
                role="alert"
                className={`text-[13px] leading-5 ${messageTone === 'error' ? 'text-red-400' : 'text-[var(--ready)]'}`}
              >
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!hydrated || busy}
              className="btn-primary h-[52px] w-full text-[15px] disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Sign in
              {!loading ? <ArrowRight className="size-4" /> : null}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4" role="separator">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg-muted-2)]">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className={`grid gap-3 ${passkeysSupported ? 'sm:grid-cols-2' : ''}`}>
            {passkeysSupported ? (
              <button type="button" onClick={handlePasskey} disabled={!hydrated || busy} className={quietBtnClass}>
                {passkeyLoading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-[17px]" />}
                Passkey
              </button>
            ) : null}
            <button type="button" onClick={handleGoogle} disabled={!hydrated || busy} className={quietBtnClass}>
              {oauthLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleGlyph className="size-[17px]" />}
              Google
            </button>
          </div>

          <div className="mt-4">
            <PhoneLoginForm
              disabled={!hydrated || loading || oauthLoading || passkeyLoading}
              onBusyChange={setPhoneBusy}
              onAuthenticated={goNext}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
