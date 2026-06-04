'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  MoreHorizontal,
  Settings,
  ShoppingCart,
  Workflow,
} from 'lucide-react'

const integrations = [
  {
    name: 'Calendly',
    description: 'Import booking offers. Use Calendly token.',
    status: 'Available',
    action: 'Import via Tools',
    href: '/dashboard/tools',
    icon: Calendar,
    accent: 'violet',
  },
  {
    name: 'Stripe',
    description: 'Import prices, payment links, and product checkout URLs.',
    status: 'Available',
    action: 'Configure',
    href: '/dashboard/billing',
    icon: CreditCard,
    accent: 'cyan',
  },
  {
    name: 'Google Calendar',
    description: 'Expose availability windows.',
    status: 'Available',
    action: 'Connect',
    href: '/create',
    icon: Calendar,
    accent: 'blue',
  },
  {
    name: 'Zapier / Make',
    description: 'Automate CRM updates.',
    status: 'Available',
    action: 'Connect',
    href: '/dashboard/settings',
    icon: Workflow,
    accent: 'zinc',
  },
  {
    name: 'Shopify / Woo',
    description: 'Import product catalogs.',
    status: 'Available',
    action: 'Import in Tools',
    href: '/dashboard/tools',
    icon: ShoppingCart,
    accent: 'purple',
  },
  {
    name: 'CSV Upload',
    description: 'Bulk import products, services, FAQs, and page metadata.',
    status: 'Manual',
    action: 'Upload',
    href: '/create?import=csv',
    icon: Download,
    accent: 'zinc',
  },
]

export default function IntegrationsPage() {
  const [calendlyConnection, setCalendlyConnection] = useState<{ lastSync: string; maskedToken: string } | null>(null)
  const [calendlyWebhook, setCalendlyWebhook] = useState<{ lastSaved: string } | null>(null)
  const [stripeConnection, setStripeConnection] = useState<{ lastImport: string } | null>(null)
  const [shopifyConnection, setShopifyConnection] = useState<{ lastImport: string } | null>(null)

  useEffect(() => {
    try {
      const pat = localStorage.getItem('nexez_calendly_connection')
      if (pat) setCalendlyConnection(JSON.parse(pat))

      const webhook = localStorage.getItem('nexez_calendly_webhook')
      if (webhook) setCalendlyWebhook(JSON.parse(webhook))

      const stripe = localStorage.getItem('nexez_stripe_connection')
      if (stripe) setStripeConnection(JSON.parse(stripe))

      const shopify = localStorage.getItem('nexez_shopify_connection')
      if (shopify) setShopifyConnection(JSON.parse(shopify))
    } catch {}
  }, [])

  // Dynamic status for integrations (Phase 3 status dashboard)
  const dynamicIntegrations = integrations.map((int) => {
    if (int.name === 'Calendly') {
      const hasPat = !!calendlyConnection
      const hasWebhook = !!calendlyWebhook

      if (hasPat || hasWebhook) {
        const parts = []
        if (hasPat) parts.push(`PAT • ${new Date(calendlyConnection!.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
        if (hasWebhook) parts.push(`Webhook • ${new Date(calendlyWebhook!.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)

        return {
          ...int,
          status: 'Connected',
          description: parts.join(' • '),
          action: 'Manage in Tools',
        }
      }
    }

    if (int.name === 'Stripe') {
      if (stripeConnection) {
        return {
          ...int,
          status: 'Connected',
          description: `Connected • Last import ${new Date(stripeConnection.lastImport).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          action: 'Manage in Tools',
        }
      }
    }

    if (int.name === 'Shopify / Woo') {
      if (shopifyConnection) {
        return {
          ...int,
          status: 'Connected',
          description: `Connected • Last import ${new Date(shopifyConnection.lastImport).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          action: 'Manage in Tools',
        }
      }
    }

    return int
  })

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="border-b border-white/10 pb-6">
          <p className="text-sm text-cyan-200">Integrations & Imports</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Connect tools. Import offers.</h1>
          <p className="mt-4 max-w-3xl text-zinc-400">
            Structured sync for pricing, bookings, and purchase paths.
          </p>
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-5">
            <div>
              <h2 className="font-semibold">Why connect?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Current data builds agent trust.
              </p>
            </div>
            <div className="card !p-4 text-xs border-cyan-300/20 bg-cyan-300/10">
              <p className="font-medium text-cyan-100 mb-2">Integration Health</p>
              <div className="space-y-1 text-zinc-300 text-[11px]">
                <div className="flex justify-between"><span>Calendly</span><span className="text-emerald-400">Import + Webhooks + Secrets</span></div>
                <div className="flex justify-between"><span>Stripe</span><span className="text-emerald-400">Import + Active price webhooks</span></div>
                <div className="flex justify-between"><span>Shopify</span><span className="text-emerald-400">Catalog + Re-sync</span></div>
                <div className="flex justify-between"><span>Google Calendar</span><span className="text-emerald-400">Stub + Structured windows</span></div>
                <div className="flex justify-between"><span>Outbound (Zapier etc.)</span><span className="text-emerald-400">Per-page • Secrets • Testable</span></div>
              </div>
              <div className="mt-3 pt-2 border-t border-cyan-300/30 text-cyan-300 text-[10px]">
                Outbound webhooks fire on bookings.
              </div>
            </div>
          </aside>

          <section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dynamicIntegrations.map((integration) => (
                <IntegrationCard key={integration.name} {...integration} />
              ))}
            </div>

            <div className="mt-5 flex flex-col justify-between gap-4 card !p-5 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-semibold">No integration yet?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Manual entry is fastest.
                </p>
              </div>
              <a
                href="/create"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
              >
                Manual Entry
                <ExternalLink className="size-4" />
              </a>
            </div>

            {/* Full throttle: Dedicated Consumer Integrations section - polished */}
            <div className="mt-6 card !p-5 border-pink-300/20 bg-pink-300/5">
              <div className="font-semibold text-pink-300 mb-2">Consumer & Local Services Integrations</div>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    Square
                    <span className="text-[9px] rounded bg-pink-400/10 px-1 py-0 text-pink-300">Consumer</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">Payments + bookings for mobile services, wellness, home services. Rich consumer fields (isMobile, travelFee, serviceArea, duration).</p>
                  <a href="/dashboard/tools" className="text-[10px] text-pink-300 hover:underline">Import in Tools →</a>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    Acuity Scheduling
                    <span className="text-[9px] rounded bg-orange-400/10 px-1 py-0 text-orange-300">Consumer</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">Appointment types for coaching, beauty, medical, fitness. Strong time-based consumer offerings with duration + tiers.</p>
                  <a href="/dashboard/tools" className="text-[10px] text-orange-300 hover:underline">Import in Tools →</a>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-pink-300/80">Import → edit → re-sync.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function IntegrationCard({
  name,
  description,
  status,
  action,
  href,
  icon: Icon,
  accent,
}: {
  name: string
  description: string
  status: string
  action: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}) {
  const connected = status === 'Connected'

  return (
    <article className="card !p-5">
      <div className="flex items-start justify-between">
        <div
          className={`flex size-11 items-center justify-center rounded-lg ${
            accent === 'cyan'
              ? 'bg-cyan-300/15 text-cyan-200'
              : accent === 'violet'
                ? 'bg-violet-300/15 text-violet-200'
                : accent === 'purple'
                  ? 'bg-purple-300/15 text-purple-200'
                  : accent === 'blue'
                    ? 'bg-blue-300/15 text-blue-200'
                    : 'bg-zinc-600/30 text-zinc-200'
          }`}
        >
          <Icon className="size-5" />
        </div>
        <button className="min-h-[44px] min-w-[44px] rounded-md p-2 text-zinc-500 hover:bg-white/10 hover:text-white active:bg-white/10 md:p-1" aria-label={`${name} options`}>
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <h3 className="mt-6 text-xl font-semibold">{name}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{description}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <span
          className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${
            connected ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-zinc-300'
          }`}
        >
          {connected ? <CheckCircle2 className="size-4" /> : <Settings className="size-4" />}
          {status}
        </span>
        <a href={href} className="flex-1 rounded-md bg-white/15 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/20 active:bg-white/20">
          {action}
        </a>
      </div>
    </article>
  )
}
