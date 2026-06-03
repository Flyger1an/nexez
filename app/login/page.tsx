'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { createClient } from '../../utils/supabase/client'

type Mode = 'signin' | 'signup' | 'reset'

const INDUSTRIES = [
  'Professional Services',
  'Consulting',
  'Software / SaaS',
  'Marketing & Creative',
  'Home & Trade Services',
  'Health & Wellness',
  'Fitness & Coaching',
  'Beauty & Personal Care',
  'Hospitality & Events',
  'Retail & E-commerce',
  'Real Estate',
  'Other',
]

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

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
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

  function setError(msg: string) {
    setMessageTone('error')
    setMessage(msg)
  }
  function setInfo(msg: string) {
    setMessageTone('info')
    setMessage(msg)
  }

  function validate(): string | null {
    if (mode === 'reset') {
      if (!email.trim()) return 'Enter the email associated with your account.'
      return null
    }
    if (!email.trim()) return 'Email is required.'
    if (!password) return 'Password is required.'
    if (mode === 'signup') {
      if (!fullName.trim()) return 'Please enter your full name.'
      if (!company.trim()) return 'Please enter your company or business name.'
      if (password.length < 8) return 'Password must be at least 8 characters.'
      if (password !== confirm) return 'Passwords do not match.'
      if (!agree) return 'Please accept the Terms and Privacy Policy to continue.'
    }
    return null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setMessage('')
    const supabase = createClient()

    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback`,
        })
        if (error) return setError(error.message)
        return setInfo('Password reset link sent. Check your email to continue.')
      }

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) return setError(error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: fullName.trim(),
              company: company.trim(),
              industry: industry || null,
            },
          },
        })
        if (error) return setError(error.message)
        if (!data.session) {
          return setInfo('Account created. Check your email to confirm, then sign in.')
        }
      }

      const next = new URLSearchParams(window.location.search).get('next') || '/dashboard'
      window.location.href = next
    } finally {
      setLoading(false)
    }
  }

  const title =
    mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your Nexez account' : 'Reset your password'
  const subtitle =
    mode === 'signin'
      ? 'Sign in to manage your agent-optimized pages and custom domains.'
      : mode === 'signup'
        ? 'Set up your workspace to publish, host, and monitor pages built for AI agents.'
        : 'We’ll email you a secure link to set a new password.'

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        {/* Brand / value panel (desktop) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 p-10 lg:flex">
          <div className="absolute -right-24 top-10 size-72 rounded-full bg-[#7C3AED]/25 blur-3xl" />
          <div className="absolute -left-16 bottom-10 size-72 rounded-full bg-[#00F5FF]/15 blur-3xl" />
          <a href="/" className="relative inline-flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00F5FF]">
              <span className="text-lg font-bold text-[#0A0A0F]">N</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">Nexez</span>
          </a>
          <div className="relative space-y-6">
            <h2 className="text-2xl font-semibold leading-snug">
              The platform for pages that <span className="text-[#C4B5FD]">AI agents</span> discover, understand, and
              buy from.
            </h2>
            <ul className="space-y-3 text-sm text-zinc-300">
              <Benefit icon={<Bot className="size-4" />} text="Agent-optimized pages with JSON-LD, llms.txt & MCP" />
              <Benefit icon={<Sparkles className="size-4" />} text="AI co-pilot, importer & simulator built in" />
              <Benefit icon={<ShieldCheck className="size-4" />} text="Deploy to your own custom domain, white-labeled" />
            </ul>
          </div>
          <p className="relative text-xs text-zinc-500">Human-first management. Agent-first consumption.</p>
        </aside>

        {/* Form panel */}
        <div className="flex flex-col justify-center px-6 py-12 sm:px-10">
          <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white lg:hidden">
            <ArrowLeft className="size-4" /> Home
          </a>

          <div className="mx-auto w-full max-w-md">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{subtitle}</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              {mode === 'signup' && (
                <>
                  <Field label="Full name" icon={<User className="size-4" />}>
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                      placeholder="Jordan Rivera"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Company / business name" icon={<Building2 className="size-4" />}>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className={inputClass}
                      placeholder="Acme Plumbing Co."
                      autoComplete="organization"
                    />
                  </Field>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-200">Industry (optional)</span>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className={inputClass}
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
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </Field>

              {mode !== 'reset' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-11`}
                      placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                  {confirm.length > 0 && confirm !== password && (
                    <p className="mt-1 text-xs text-red-400">Passwords don’t match.</p>
                  )}
                </Field>
              )}

              {mode === 'signup' && (
                <label className="flex items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I agree to the <a href="/terms" className="text-cyan-200 hover:underline">Terms of Service</a> and{' '}
                    <a href="/privacy" className="text-cyan-200 hover:underline">Privacy Policy</a>.
                  </span>
                </label>
              )}

              {mode === 'signin' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset')
                      setMessage('')
                    }}
                    className="text-xs text-cyan-200 hover:text-cyan-100"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {message ? (
                <p
                  className={`rounded-lg border p-3 text-sm ${
                    messageTone === 'error'
                      ? 'border-red-300/30 bg-red-400/10 text-red-200'
                      : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                  }`}
                >
                  {message}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#00F5FF] px-5 font-medium text-[#0A0A0F] transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </button>
            </form>

            <div className="mt-6 text-sm text-zinc-400">
              {mode === 'signin' ? (
                <span>
                  New to Nexez?{' '}
                  <button onClick={() => switchMode('signup')} className="text-cyan-200 hover:text-cyan-100">
                    Create an account
                  </button>
                </span>
              ) : mode === 'signup' ? (
                <span>
                  Already have an account?{' '}
                  <button onClick={() => switchMode('signin')} className="text-cyan-200 hover:text-cyan-100">
                    Sign in
                  </button>
                </span>
              ) : (
                <button onClick={() => switchMode('signin')} className="text-cyan-200 hover:text-cyan-100">
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )

  function switchMode(next: Mode) {
    setMode(next)
    setMessage('')
  }
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

function Benefit({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-7 items-center justify-center rounded-lg bg-white/5 text-[#00F5FF]">{icon}</span>
      <span>{text}</span>
    </li>
  )
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-[#7C3AED]/60'
