'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
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
    description: 'Import event types as offers. Use PAT in Tools → Site Importer for structured pull into editable cards.',
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
    description: 'Expose availability windows agents can reason about.',
    status: 'Available',
    action: 'Connect',
    href: '/create',
    icon: Calendar,
    accent: 'blue',
  },
  {
    name: 'Zapier / Make',
    description: 'Automate updates from CRMs, forms, sheets, and internal tools.',
    status: 'Available',
    action: 'Connect',
    href: '/dashboard/settings',
    icon: Workflow,
    accent: 'zinc',
  },
  {
    name: 'Shopify / Woo',
    description: 'Import product catalog from Shopify stores (public feed + enhanced extraction).',
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
        <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" />
          Dashboard
        </a>

        <div className="mt-8 border-b border-white/10 pb-6">
          <p className="text-sm text-cyan-200">Integrations & Imports</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Connect your tools. Auto-import services and availability.
          </h1>
          <p className="mt-4 max-w-3xl text-zinc-400">
            Nexez should become the structured layer between your existing tools and AI agents.
            Start by connecting the systems that already know your products, pricing, bookings,
            and purchase paths.
          </p>
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-5">
            <div>
              <h2 className="font-semibold">Why connect?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Real-time data makes your Nexez agent pages more trustworthy. Agents can parse current
                offers, route bookings, and avoid stale pricing.
              </p>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-xs">
              <p className="font-medium text-cyan-100 mb-2">Integrations Health</p>
              <div className="space-y-2 text-zinc-400">
                <div className="flex justify-between">
                  <span>Calendly</span>
                  <span className="text-emerald-400">Deep + Webhooks</span>
                </div>
                <div className="flex justify-between">
                  <span>Stripe</span>
                  <span className="text-emerald-400">Import + Re-sync</span>
                </div>
                <div className="flex justify-between">
                  <span>Shopify</span>
                  <span className="text-emerald-400">Catalog Import</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-cyan-300/30 text-cyan-300 text-[10px]">
                → Full management and re-sync in Tools. Webhooks fire automatically on real bookings.
              </div>
              {/* Phase 3: Outbound visibility */}
              <div className="mt-2 pt-2 border-t border-cyan-300/30 text-[10px] text-emerald-300">
                Outbound webhooks (per-page in Settings) now fire on Nexez checkout events + Calendly bookings.
              </div>
            </div>
          </aside>

          <section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dynamicIntegrations.map((integration) => (
                <IntegrationCard key={integration.name} {...integration} />
              ))}
            </div>

            <div className="mt-5 flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-semibold">No integration yet?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Manual entry remains the fastest way to create an agent-readable page.
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
    <article className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
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
        <button className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={`${name} options`}>
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <h3 className="mt-6 text-xl font-semibold">{name}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{description}</p>

      <div className="mt-6 flex gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${
            connected ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-zinc-300'
          }`}
        >
          {connected ? <CheckCircle2 className="size-4" /> : <Settings className="size-4" />}
          {status}
        </span>
        <a href={href} className="flex-1 rounded-md bg-white/15 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/20">
          {action}
        </a>
      </div>
    </article>
  )
}
