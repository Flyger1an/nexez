'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NexezLogo } from './NexezLogo'
import { safeNextPath } from '../lib/safe-redirect'
import {
  Bot,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { INDUSTRIES } from '../lib/industries'

export type LoginMode = 'signin' | 'signup' | 'reset'

// Lightweight password strength scoring (0-4) — display only, server enforces length.
function scorePassword(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981']
  return { score, label: labels[score], color: colors[score] }
}

export function LoginForm({ initialMode = 'signin', nextPath }: { initialMode?: LoginMode; nextPath?: string }) {
  const [hydrated, setHydrated] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const submitHandlerRef = useRef<(event: Event) => void>(() => {})
  const loadingRef = useRef(false)
  const [mode, setMode] = useState<LoginMode>(initialMode)
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [industry, setIndustry] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('info')

  const strength = useMemo(() => scorePassword(password), [password])

  useEffect(() => {
    setMode(initialMode)
    setMessage('')
    setLoading(false)
  }, [initialMode])

  // Surface an auth error bounced here via the URL (e.g. an expired confirmation
  // link from /auth/callback) so the user isn't dropped on a silent blank form.
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
  function setInfo(msg: string) {
    setMessageTone('info')
    setMessage(msg)
  }

  function switchMode(next: LoginMode) {
    setMode(next)
    setMessage('')
    setLoading(false)
  }

  function modeHref(next: LoginMode) {
    const params = new URLSearchParams()
    if (next !== 'signin') params.set('mode', next)
    if (nextPath) params.set('next', nextPath)
    const query = params.toString()
    return query ? `/login?${query}` : '/login'
  }

  function handleModeLink(next: LoginMode) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
      event.preventDefault()
      window.history.pushState(null, '', modeHref(next))
      switchMode(next)
    }
  }

  function getFormValues() {
    const form = formRef.current
    const data = form ? new FormData(form) : null

    return {
      fullName: String(data?.get('fullName') ?? fullName).trim(),
      company: String(data?.get('company') ?? company).trim(),
      industry: String(data?.get('industry') ?? industry),
      email: String(data?.get('email') ?? email).trim(),
      password: String(data?.get('password') ?? password),
      confirm: String(data?.get('confirm') ?? confirm),
      agree: data ? data.get('agree') === 'on' : agree,
    }
  }

  function validate(values = getFormValues()): string | null {
    if (mode === 'reset') {
      if (!values.email) return 'Enter the email associated with your account.'
      return null
    }
    if (!values.email) return 'Email is required.'
    if (!values.password) return 'Password is required.'
    if (mode === 'signup') {
      if (!values.fullName) return 'Please enter your full name.'
      if (!values.company) return 'Please enter your company or business name.'
      if (values.password.length < 8) return 'Password must be at least 8 characters.'
      if (values.password !== values.confirm) return 'Passwords do not match.'
      if (!values.agree) return 'Please accept the Terms and Privacy Policy to continue.'
    }
    return null
  }

  async function handleSubmit(event: Pick<Event, 'preventDefault'>) {
    event.preventDefault()
    if (loadingRef.current) return

    const values = getFormValues()
    const validationError = validate(values)
    if (validationError) {
      setError(validationError)
      return
    }

    loadingRef.current = true
    setLoading(true)
    setMessage('')
    const supabase = createClient()

    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        })
        if (error) return setError(error.message)
        return setInfo('Password reset link sent. Check your email to continue.')
      }

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
        if (error) return setError(error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: values.fullName,
              company: values.company,
              industry: values.industry || null,
            },
          },
        })
        if (error) return setError(error.message)
        if (!data.session) {
          return setInfo('Account created. Check your email to confirm, then sign in.')
        }
      }

      // Guard against open redirect: only follow a same-origin relative path.
      const next = safeNextPath(new URLSearchParams(window.location.search).get('next') || nextPath)
      window.location.href = next
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  useLayoutEffect(() => {
    submitHandlerRef.current = (event: Event) => {
      void handleSubmit(event)
    }
  })

  useLayoutEffect(() => {
    const form = formRef.current
    const submitButton = submitButtonRef.current
    if (!form || !submitButton) return

    const onSubmit = (event: SubmitEvent) => submitHandlerRef.current(event)
    const onSubmitClick = (event: MouseEvent) => submitHandlerRef.current(event)
    form.addEventListener('submit', onSubmit)
    submitButton.addEventListener('click', onSubmitClick)
    setHydrated(true)

    return () => {
      form.removeEventListener('submit', onSubmit)
      submitButton.removeEventListener('click', onSubmitClick)
    }
  }, [])

  const title =
    mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your Nexez account' : 'Reset your password'
  const subtitle =
    mode === 'signin'
      ? 'Sign in to manage your agent-optimized listings and custom domains.'
      : mode === 'signup'
        ? 'Set up your workspace to publish, host, and monitor listings built for AI agents.'
        : 'We’ll email you a secure link to set a new password.'

  return (
    <main className="min-h-screen bg-background text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5">
        <header className="flex h-16 items-center justify-between border-b border-border">
          <a href="/" className="inline-flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-border bg-white text-black">
              <NexezLogo className="size-6" />
            </div>
            <span className="text-sm font-medium tracking-tight">Nexez</span>
          </a>
          <a href="/pricing" className="text-sm text-zinc-400 hover:text-white">Pricing</a>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(420px,0.7fr)]">
          <section className="hidden lg:block">
            <p className="text-sm font-medium text-muted-foreground">Human-first management. Agent-first consumption.</p>
            <h2 className="mt-4 max-w-2xl text-5xl font-semibold tracking-[-0.055em]">
              Manage the business surface AI agents can use.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Sign in to publish agent listings, inspect readiness, run simulations, and track the signals your main website was never built to expose.
            </p>
            <div className="mt-8 grid max-w-xl gap-3">
              <Benefit icon={<Bot className="size-4" />} title="Agent-readable listings" text="JSON-LD, llms.txt, agent.json, MCP, and clean public HTML." />
              <Benefit icon={<ShieldCheck className="size-4" />} title="Controlled workspace" text="Listings, imports, custom domains, support, billing, and analytics in one place." />
              <Benefit icon={<Check className="size-4" />} title="Fast launch path" text="Import offers, polish details, publish, then measure real agent behavior." />
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-lg border border-border bg-white/[0.03] p-5 shadow-2xl shadow-black/40 sm:p-6">
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  {mode === 'signin' ? 'Account access' : mode === 'signup' ? 'Create workspace' : 'Account recovery'}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
              </div>

              <form ref={formRef} data-hydrated={hydrated ? 'true' : 'false'} className="mt-8 space-y-4">
                {mode === 'signup' && (
                  <>
                    <Field label="Full name" icon={<User className="size-4" />}>
                      <input
                        name="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={inputClass}
                        placeholder="Jordan Rivera"
                        autoComplete="name"
                        disabled={!hydrated || loading}
                      />
                    </Field>
                    <Field label="Company / business name" icon={<Building2 className="size-4" />}>
                      <input
                        name="company"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className={inputClass}
                        placeholder="Apex Plumbing Co."
                        autoComplete="organization"
                        disabled={!hydrated || loading}
                      />
                    </Field>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-zinc-200">Industry (optional)</span>
                      <select
                        name="industry"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className={inputClass}
                        disabled={!hydrated || loading}
                      >
                        <option value="">Select an industry…</option>
                        {INDUSTRIES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                <Field label={mode === 'reset' ? 'Account email' : 'Work email'} icon={<Mail className="size-4" />}>
                  <input
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={!hydrated || loading}
                    required
                  />
                </Field>

              {mode !== 'reset' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-11`}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      disabled={!hydrated || loading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      disabled={!hydrated || loading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white disabled:opacity-50"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {mode === 'signup' && password.length > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }}
                        />
                      </div>
                      <p className="mt-1 text-xs" style={{ color: strength.color }}>
                        {strength.label}
                      </p>
                    </div>
                  )}
                </label>
              )}

              {mode === 'signup' && (
                <Field label="Confirm password">
                  <input
                    name="confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    disabled={!hydrated || loading}
                    required
                  />
                  {confirm.length > 0 && confirm !== password && (
                    <p className="mt-1 text-xs text-red-400">Passwords don’t match.</p>
                  )}
                </Field>
              )}

              {mode === 'signup' && (
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input
                    type="checkbox"
                    name="agree"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    disabled={!hydrated || loading}
                    className="mt-0.5 size-4 rounded border-border bg-[var(--fill-1)] accent-[var(--signal)]"
                  />
                  <span>
                    I agree to the <a href="/terms" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Terms of Service</a> and{' '}
                    <a href="/privacy" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Privacy Policy</a>.
                  </span>
                </label>
              )}

              {mode === 'signin' && (
                <div className="flex justify-end">
                  <a
                    href={modeHref('reset')}
                    onClick={handleModeLink('reset')}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    Forgot password?
                  </a>
                </div>
              )}

              {message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${
                    messageTone === 'error'
                      ? 'border-red-300/30 bg-red-400/10 text-red-200'
                      : 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]'
                  }`}
                >
                  {message}
                </p>
              ) : null}

              <button
                ref={submitButtonRef}
                type="submit"
                disabled={!hydrated || loading}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-60"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </button>
              </form>

              <div className="mt-6 text-sm text-muted-foreground">
                {mode === 'signin' ? (
                  <span>
                    New to Nexez?{' '}
                    <a href={modeHref('signup')} onClick={handleModeLink('signup')} className="text-white hover:underline">
                      Create an account
                    </a>
                  </span>
                ) : mode === 'signup' ? (
                  <span>
                    Already have an account?{' '}
                    <a href={modeHref('signin')} onClick={handleModeLink('signin')} className="text-white hover:underline">
                      Sign in
                    </a>
                  </span>
                ) : (
                  <a href={modeHref('signin')} onClick={handleModeLink('signin')} className="text-white hover:underline">
                    Sign in instead
                  </a>
                )}
              </div>
            </div>

            <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
              Public agent listings stay crawlable. Account tools stay protected behind your session.
            </p>
          </section>
        </div>
      </div>
    </main>
  )

}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-200">
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-black text-[var(--signal)]">{icon}</span>
        <p className="text-sm font-medium text-white">{title}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-border bg-[var(--fill-1)] px-3 py-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none transition focus:border-[var(--signal)]'
