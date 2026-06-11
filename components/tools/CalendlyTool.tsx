'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Self-contained Calendly tool: token import, webhook configuration + test, and
// the imported-events result. Owns its own state and restores connection/webhook
// status from localStorage on mount. Import + webhook logic is unchanged; the
// test webhook reads configured outbound endpoints from localStorage at send time
// (previously shared with the Outbound Webhooks section's state).
export function CalendlyTool() {
  const [calendlyToken, setCalendlyToken] = useState('')
  const [calendlyLoading, setCalendlyLoading] = useState(false)
  const [calendlyResult, setCalendlyResult] = useState<any>(null)
  const [calendlyConnected, setCalendlyConnected] = useState<{ lastSync: string; maskedToken: string } | null>(null)

  const [webhookSecret, setWebhookSecret] = useState('')
  const [webhookConnected, setWebhookConnected] = useState<{ lastSaved: string } | null>(null)
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestPageSlug, setWebhookTestPageSlug] = useState('')
  const [lastWebhookEvent, setLastWebhookEvent] = useState<any>(null)
  const [calendlyWebhookEndpoint, setCalendlyWebhookEndpoint] = useState('/api/webhooks/calendly')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexez_calendly_connection')
      if (saved) setCalendlyConnected(JSON.parse(saved))

      const lastWebhook = localStorage.getItem('nexez_last_calendly_webhook')
      if (lastWebhook) setLastWebhookEvent(JSON.parse(lastWebhook))
    } catch {}
  }, [])

  useEffect(() => {
    setCalendlyWebhookEndpoint(`${window.location.origin}/api/webhooks/calendly`)
    try {
      const saved = localStorage.getItem('nexez_calendly_webhook')
      if (saved) setWebhookConnected(JSON.parse(saved))
    } catch {}
  }, [])

  function saveCalendlyConnection(token: string) {
    const masked = token.slice(0, 4) + '••••' + token.slice(-4)
    const connection = {
      lastSync: new Date().toISOString(),
      maskedToken: masked,
    }
    localStorage.setItem('nexez_calendly_connection', JSON.stringify(connection))
    setCalendlyConnected(connection)
  }

  async function handleCalendlyImport() {
    if (!calendlyToken.trim()) return
    setCalendlyLoading(true)
    setCalendlyResult(null)

    try {
      const res = await fetch('/api/integrations/calendly/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: calendlyToken.trim() }),
      })
      const data = await res.json()
      setCalendlyResult(data)

      if (!data.error) {
        saveCalendlyConnection(calendlyToken.trim())
      }
    } catch (e) {
      setCalendlyResult({ error: 'Failed to import from Calendly' })
    } finally {
      setCalendlyLoading(false)
    }
  }

  function startPageFromCalendly() {
    if (!calendlyResult?.structuredOffers?.length) return
    sessionStorage.setItem('nexez_imported_structured', JSON.stringify(calendlyResult.structuredOffers))
    sessionStorage.setItem('nexez_imported_page', JSON.stringify({
      name: 'My Calendly Bookings',
      description: 'Book time with me via Calendly. All availability synced.',
    }))
    window.location.href = '/create?imported=true&source=calendly'
  }

  async function handleCalendlyReSync() {
    if (!calendlyToken.trim()) {
      alert('Paste your Calendly token to re-sync.')
      return
    }
    await handleCalendlyImport()
  }

  function saveCalendlyWebhook(secret: string) {
    if (!secret.trim()) return
    const data = { lastSaved: new Date().toISOString() }
    localStorage.setItem('nexez_calendly_webhook', JSON.stringify(data))
    setWebhookConnected(data)
    setWebhookSecret('')
  }

  async function sendTestWebhook() {
    if (!webhookSecret.trim()) {
      alert('Please save a webhook secret first.')
      return
    }

    setWebhookTesting(true)
    setWebhookTestResult(null)

    const testPayload = {
      event: 'invitee.created',
      payload: {
        invitee: { name: 'Test User', email: 'test@example.com' },
        event: { name: 'Test Consultation', start_time: new Date().toISOString() },
      },
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-nexez-test-secret': webhookSecret.trim(),
        'x-nexez-test-mode': 'true',
      }

      if (webhookTestPageSlug.trim()) {
        headers['x-nexez-test-page-slug'] = webhookTestPageSlug.trim()
      }
      // Forward configured outbound endpoints so the receiver fires them on booking events.
      let outbound: string[] = []
      try { outbound = JSON.parse(localStorage.getItem('nexez_outbound_webhooks') || '[]') } catch {}
      if (outbound.length > 0) {
        headers['x-nexez-outbound-endpoints'] = JSON.stringify(outbound)
      }

      const res = await fetch('/api/webhooks/calendly', {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      })
      const data = await res.json()
      const result = { status: res.status, data, receivedAt: new Date().toISOString() }
      setWebhookTestResult(result)
      setLastWebhookEvent(result)
      localStorage.setItem('nexez_last_calendly_webhook', JSON.stringify(result))
    } catch (e: any) {
      setWebhookTestResult({ error: e.message })
    } finally {
      setWebhookTesting(false)
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-violet-400/20 bg-white/[0.015] p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-violet-200">Calendly Booking Import</h2>
          <p className="text-[#9CA3AF] mt-1">Connect your Calendly token to import event types as bookable offers.</p>
        </div>
        {calendlyConnected && (
          <div className="text-right text-xs">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300">
              <div className="size-1.5 rounded-full bg-emerald-400" />
              Connected
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">
              Last sync {new Date(calendlyConnected.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <input
          type="password"
          value={calendlyToken}
          onChange={(e) => setCalendlyToken(e.target.value)}
          placeholder="Calendly token"
          className="flex-1 input"
        />
        <button
          onClick={handleCalendlyImport}
          disabled={calendlyLoading || !calendlyToken.trim()}
          className="btn-primary bg-violet-300 text-zinc-950 hover:bg-violet-200"
        >
          {calendlyLoading ? <Loader2 className="size-4 animate-spin" /> : 'Import Events'}
        </button>
        {calendlyConnected && (
          <button
            onClick={handleCalendlyReSync}
            disabled={calendlyLoading}
            className="rounded-lg border border-violet-300/40 px-4 py-2 text-sm text-violet-200 hover:bg-white/5"
          >
            Re-sync
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] text-zinc-500">
        Get your token at{' '}
        <a href="https://calendly.com/integrations/api_webhooks" target="_blank" className="underline hover:text-violet-300">
          Calendly Integrations → API &amp; Webhooks
        </a>
      </p>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-violet-200">Booking updates</span>
          <span className="text-[10px] rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
            Receiver Active
          </span>
          {webhookConnected && (
            <span className="text-[10px] rounded bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
              Secret Saved
            </span>
          )}
        </div>

        <p className="text-xs text-zinc-500 mb-3">
          Nexez can receive booking events from Calendly. Create a webhook in Calendly, then paste the signing secret below.
        </p>

        <div className="rounded bg-black/30 p-3 text-xs font-mono mb-3 break-all">
          POST {calendlyWebhookEndpoint}
        </div>

        <div className="flex gap-3">
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Signing secret from Calendly"
            className="flex-1 input text-sm"
          />
          <button
            onClick={() => saveCalendlyWebhook(webhookSecret)}
            disabled={!webhookSecret.trim()}
            className="rounded-lg border border-violet-300/40 px-4 text-sm text-violet-200 hover:bg-white/5"
          >
            Save Secret
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <button
              onClick={sendTestWebhook}
              disabled={webhookTesting || !webhookSecret.trim()}
              className="rounded-lg border border-violet-300/40 px-4 py-1.5 text-sm text-violet-200 hover:bg-white/5 disabled:opacity-50"
            >
              {webhookTesting ? 'Sending test...' : 'Send test event'}
            </button>
            <span className="text-[10px] text-zinc-500">Confirms Calendly events can reach Nexez</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={webhookTestPageSlug}
              onChange={(e) => setWebhookTestPageSlug(e.target.value)}
              placeholder="Optional: your-page-slug"
              className="flex-1 input text-sm"
            />
          </div>
          <p className="text-[10px] text-zinc-500 -mt-1">
            If you enter one of your page slugs above, the test event will create a real entry in your Analytics.
          </p>
        </div>

        {webhookTestResult && (
          <div className="mt-3 rounded bg-black/40 p-3 text-xs font-mono">
            {webhookTestResult.error ? (
              <span className="text-red-400">Error: {webhookTestResult.error}</span>
            ) : (
              <span className="text-emerald-300">Success ({webhookTestResult.status}): Calendly test event received.</span>
            )}
          </div>
        )}

        {lastWebhookEvent && (
          <div className="mt-4 rounded border border-emerald-300/30 bg-emerald-400/5 p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-emerald-300">Last Booking Received</span>
              <button
                onClick={() => {
                  setLastWebhookEvent(null)
                  localStorage.removeItem('nexez_last_calendly_webhook')
                }}
                className="text-[10px] text-zinc-500 hover:text-red-400"
              >
                Clear
              </button>
            </div>
            <div className="text-xs text-zinc-500 mb-1">
              {lastWebhookEvent.receivedAt ? new Date(lastWebhookEvent.receivedAt).toLocaleString() : 'Just now'}
            </div>
            <div>
              <span className="font-medium">{lastWebhookEvent.data?.payload?.event?.name || 'Consultation'}</span>
              <span className="text-zinc-400"> with </span>
              <span className="font-medium">{lastWebhookEvent.data?.payload?.invitee?.name || 'Guest'}</span>
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-1">
              Recorded in Analytics as a booking event.
            </div>
          </div>
        )}

        <p className="mt-2 text-[10px] text-zinc-500">
          1. In Calendly → Integrations → Webhooks, create a booking webhook.<br />
          2. Set the URL to the address above.<br />
          3. Copy the Signing Secret and paste it here.
        </p>
        <p className="mt-1 text-[10px] text-violet-400">
          Nexez verifies the secret before accepting booking events.
        </p>
      </div>

      {calendlyResult && (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-6">
          {calendlyResult.error ? (
            <p className="text-red-400">{calendlyResult.error}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-emerald-400 font-medium">{calendlyResult.message || `Imported ${calendlyResult.count} event types`}</p>
                {calendlyResult.structuredOffers?.length > 0 && (
                  <button
                    onClick={startPageFromCalendly}
                    className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-200"
                  >
                    Create Page from these offers →
                  </button>
                )}
              </div>

              {calendlyResult.structuredOffers?.length > 0 && (
                <div className="space-y-2">
                  {calendlyResult.structuredOffers.slice(0, 6).map((offer: any, i: number) => (
                    <div key={i} className="text-sm bg-white/[0.03] p-3 rounded flex items-center justify-between gap-3">
                      <div>
                        <span className="font-medium">{offer.name}</span>
                        <span className="ml-2 text-violet-300">• {offer.duration}</span>
                      </div>
                      <a
                        href={offer.url}
                        target="_blank"
                        className="text-xs text-violet-400 hover:text-violet-300 underline"
                      >
                        Booking link
                      </a>
                    </div>
                  ))}
                  {calendlyResult.structuredOffers.length > 6 && (
                    <p className="text-[10px] text-zinc-500">+ {calendlyResult.structuredOffers.length - 6} more event types</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
