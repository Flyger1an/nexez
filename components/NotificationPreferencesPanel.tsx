'use client'

import { useState } from 'react'
import { BellRing, LockKeyhole } from 'lucide-react'
import {
  isSellerNotificationPreferences,
  type MutableSellerNotificationCategory,
  type SellerNotificationPreferences,
} from '../lib/seller-notification-policy'
import { SettingsSwitch } from './settings/SettingsPrimitives'

const PREFERENCE_ROWS = [
  {
    category: 'transactions',
    title: 'Orders and payments',
    description: 'Confirmed orders, payments, held funds, refunds, and disputes.',
    required: true,
  },
  {
    category: 'negotiations',
    title: 'Negotiations',
    description: 'New proposals, customer responses, and agreement updates.',
    required: false,
  },
  {
    category: 'integrations',
    title: 'Connections',
    description: 'Connection problems, recovery, and listing sync issues.',
    required: false,
  },
  {
    category: 'reviews',
    title: 'Reviews',
    description: 'New verified reviews and review status updates.',
    required: false,
  },
  {
    category: 'marketing',
    title: 'Growth and product updates',
    description: 'Listing readiness, customer activity, and useful Nexez updates.',
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
            These settings apply on web and mobile. Your device permissions still control push notifications.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-[var(--line-soft)] overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--fill-1)]">
        {PREFERENCE_ROWS.map((row) => {
          const enabled = preferences[row.category]
          const isSaving = !row.required && saving === row.category
          const descriptionId = `seller-notification-${row.category}-description`
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
                <p id={descriptionId} className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{row.description}</p>
              </div>

              <SettingsSwitch
                checked={enabled}
                onCheckedChange={(checked) => {
                  if (!row.required) void updatePreference(row.category, checked)
                }}
                label={row.title}
                describedBy={descriptionId}
                disabled={row.required || Boolean(saving)}
                pending={isSaving}
              />
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--fg-muted)]">
        Order and payment notices are required because they can affect fulfillment, refunds, disputes, and payouts. They cannot be turned off in Nexez.
      </p>
      {message ? (
        <p role={messageTone === 'error' ? 'alert' : 'status'} className={`mt-3 text-xs ${messageTone === 'error' ? 'text-red-300' : 'text-[var(--ready)]'}`}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
