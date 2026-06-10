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
    description: 'Turn your event types into bookable offers with direct scheduling links.',
    status: 'Available',
    action: 'Import via Tools',
    href: '/dashboard/tools',
    icon: Calendar,
    accent: 'violet',
  },
  {
    name: 'Stripe',
    description: 'Billing (subs + Connect payouts) in Billing page. Import products/prices as offers in Tools (or re-sync Stripe-sourced offers).',
    status: 'Available',
    action: 'Billing / Tools',
    href: '/dashboard/billing',
    icon: CreditCard,
    accent: 'cyan',
  },
  {
    name: 'Google Calendar',
    description: 'Expose real availability windows so agents can suggest open times.',
    status: 'Available',
    action: 'Connect',
    href: '/create',
    icon: Calendar,
    accent: 'blue',
  },
  {
    name: 'Zapier / Make',
    description: 'Send every agent-driven booking to your CRM and thousands of other apps.',
    status: 'Available',
    action: 'Connect',
    href: '/dashboard/settings',
    icon: Workflow,
    accent: 'zinc',
  },
  {
    name: 'Shopify / Woo',
    description: 'Import your product catalog with pricing, ready for agents to purchase.',
    status: 'Available',
    action: 'Import in Tools',
    href: '/dashboard/tools',
    icon: ShoppingCart,
    accent: 'purple',
  },
  {
    name: 'CSV Upload',
    description: 'Bulk-import products, services, and FAQs from a spreadsheet.',
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
          <p className="text-sm text-cyan-200">Integrations &amp; imports</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Connect your tools. Import your offers.</h1>
          <p className="mt-4 max-w-3xl text-zinc-400">
            Pull pricing, availability, and booking links from the tools you already use — then keep your agent page in
            sync automatically.
          </p>
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div>
              <h2 className="font-semibold">Why connect?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Live pricing and availability keep your page accurate — which raises the trust signals agents use to
                recommend you.
              </p>
            </div>
            <div className="card !p-4 text-xs border-cyan-300/20 bg-cyan-300/10">
              <p className="font-medium text-cyan-100 mb-3">What each integration does</p>
              <div className="space-y-2 text-zinc-300 text-[11px]">
                <div className="flex justify-between gap-3"><span>Calendly</span><span className="text-right text-emerald-300">Import, webhooks &amp; secrets</span></div>
                <div className="flex justify-between gap-3"><span>Stripe</span><span className="text-right text-emerald-300">Import &amp; live price sync</span></div>
                <div className="flex justify-between gap-3"><span>Shopify</span><span className="text-right text-emerald-300">Catalog import &amp; re-sync</span></div>
                <div className="flex justify-between gap-3"><span>Google Calendar</span><span className="text-right text-emerald-300">Availability windows</span></div>
                <div className="flex justify-between gap-3"><span>Zapier / Make</span><span className="text-right text-emerald-300">Outbound on every booking</span></div>
              </div>
              <div className="mt-3 pt-2 border-t border-cyan-300/30 text-cyan-300 text-[10px]">
                Outbound webhooks fire automatically on every agent-driven booking.
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
                <h2 className="text-xl font-semibold">Prefer to enter things manually?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  The visual builder lets you add offers, tiers, and FAQs in minutes — no connection required.
                </p>
              </div>
              <a
                href="/create"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
              >
                Manual entry
                <ExternalLink className="size-4" />
              </a>
            </div>

            {/* Consumer & local services */}
            <div className="mt-6 card !p-5 border-pink-300/20 bg-pink-300/5">
              <div className="font-semibold text-pink-300 mb-3">Consumer &amp; local services</div>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    Square
                    <span className="text-[9px] rounded bg-pink-400/10 px-1.5 py-0.5 text-pink-300">Consumer</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-5">
                    Payments and bookings for mobile, wellness, and home services — with mobile, travel-fee, service-area,
                    and duration fields.
                  </p>
                  <a href="/dashboard/tools" className="mt-2 inline-block text-[11px] text-pink-300 hover:underline">Import in Tools →</a>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    Acuity Scheduling
                    <span className="text-[9px] rounded bg-orange-400/10 px-1.5 py-0.5 text-orange-300">Consumer</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5 leading-5">
                    Appointment types for coaching, beauty, medical, and fitness — time-based offers with duration and
                    tiers.
                  </p>
                  <a href="/dashboard/tools" className="mt-2 inline-block text-[11px] text-orange-300 hover:underline">Import in Tools →</a>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-pink-300/80">Import once, then edit and re-sync from the page editor.</p>
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
                    : 'bg-white/10 text-zinc-200'
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
