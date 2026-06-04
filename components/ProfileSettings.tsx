'use client'

import { useState } from 'react'
import { Loader2, UserCircle } from 'lucide-react'
import { createClient } from '../utils/supabase/client'
import { INDUSTRIES } from '../lib/industries'

type Props = {
  email: string
  initialFullName: string
  initialCompany: string
  initialIndustry: string
}

export function ProfileSettings({ email, initialFullName, initialCompany, initialIndustry }: Props) {
  const [fullName, setFullName] = useState(initialFullName)
  const [company, setCompany] = useState(initialCompany)
  const [industry, setIndustry] = useState(initialIndustry)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState<'ok' | 'err'>('ok')

  async function save() {
    setSaving(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), company: company.trim(), industry: industry || null },
    })
    setSaving(false)
    if (error) {
      setTone('err')
      setMessage(error.message)
    } else {
      setTone('ok')
      setMessage('Profile updated.')
    }
  }

  return (
    <section className="card !p-5">
      <div className="flex items-center gap-2">
        <UserCircle className="size-5 text-cyan-200" />
        <h2 className="text-xl font-semibold">Your Profile</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-400">Used across your workspace and account. Email is managed at sign-in.</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jordan Rivera"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Company</span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Axle Plumbing Co."
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Industry</span>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
            <option value="">Select an industry…</option>
            {INDUSTRIES.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Email</span>
          <input value={email} disabled className={`${inputClass} opacity-60`} />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save profile
        </button>
        {message ? (
          <span className={`text-sm ${tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{message}</span>
        ) : null}
      </div>
    </section>
  )
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-white placeholder:text-zinc-600 outline-none transition focus:border-[#7C3AED]/60'
