'use client'

import { useState } from 'react'
import { BellRing, Check, Loader2, LockKeyhole } from 'lucide-react'
import {
  isSellerNotificationPreferences,
  type MutableSellerNotificationCategory,
  type SellerNotificationPreferences,
} from '../lib/seller-notification-policy'

const PREFERENCE_ROWS = [
  {
    category: 'transactions',
    title: 'Transactions and money state',
    description: 'Payments, escrow, captures, refunds, disputes, and confirmed orders.',
    required: true,
  },
  {
    category: 'negotiations',
    title: 'Negotiations',
    description: 'New proposals, buyer responses, and agreement activity.',
    required: false,
  },
  {
    category: 'integrations',
    title: 'Integration health',
    description: 'Connection failures, recovery, and catalog synchronization issues.',
    required: false,
  },
  {
    category: 'reviews',
    title: 'Reviews',
    description: 'New verified reviews and moderation updates.',
    required: false,
  },
  {
    category: 'marketing',
    title: 'Growth and product updates',
    description: 'Readiness changes, traffic signals, and useful Nexez product updates.',
    required: false,
  },
] as const

export function NotificationPreferencesPanel({
  initialPreferences,
}: {
  initialPreferences: SellerNotificationPreferences
}) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saving, setSaving] = useState<MutableSellerNotificationCategory | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')

  async function updatePreference(category: MutableSellerNotificationCategory, enabled: boolean) {
    if (saving) return
    const previous = preferences[category]
    setSaving(category)
    setMessage('')
    setPreferences((current) => ({ ...current, [category]: enabled }))

    try {
      const response = await fetch('/api/seller/notification-preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: { [category]: enabled } }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not save notification preferences.')

      if (!isSellerNotificationPreferences(payload.preferences)) {
        throw new Error('The server returned invalid notification preferences.')
      }
      setPreferences(payload.preferences)
      setMessageTone('success')
      setMessage('Notification preferences saved across your devices.')
    } catch (error) {
      setPreferences((current) => ({ ...current, [category]: previous }))
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Could not save notification preferences.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="card !p-5 sm:!p-6" aria-labelledby="seller-notification-settings-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--settings-emphasis)]">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="seller-notification-settings-title" className="text-xl font-semibold">Seller notifications</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
            These account settings follow you across web and mobile. Device permissions still control whether your phone can display a push.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-[var(--line-soft)] overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)]">
        {PREFERENCE_ROWS.map((row) => {
          const enabled = preferences[row.category]
          const isSaving = !row.required && saving === row.category
          return (
            <div key={row.category} className="flex min-h-20 items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--fg)]">{row.title}</h3>
                  {row.required ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ready)]/30 bg-[var(--ready)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ready)]">
                      <LockKeyhole className="size-3" aria-hidden="true" /> Required
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{row.description}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${row.title}: ${enabled ? 'on' : 'off'}`}
                disabled={row.required || Boolean(saving)}
                onClick={() => {
                  if (!row.required) void updatePreference(row.category, !enabled)
                }}
                data-testid={`seller-notification-${row.category}`}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] disabled:cursor-not-allowed ${enabled ? 'border-[var(--signal)] bg-[var(--signal)]' : 'border-[var(--line)] bg-[var(--surface)]'} ${row.required ? 'opacity-75' : ''}`}
              >
                <span className={`flex size-5 items-center justify-center rounded-full bg-white text-[var(--signal)] shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}>
                  {isSaving ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : enabled ? <Check className="size-3" aria-hidden="true" /> : null}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--fg-muted)]">
        Money-state notices are required because they can change fulfillment, refund, dispute, and payout obligations. They cannot be muted in Nexez.
      </p>
      {message ? (
        <p role={messageTone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${messageTone === 'error' ? 'text-red-300' : 'text-[var(--ready)]'}`}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
