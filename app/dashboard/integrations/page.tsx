'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  Lock,
  MoreHorizontal,
  Settings,
  ShoppingCart,
  Square as SquareIcon,
  Workflow,
} from 'lucide-react'
import { UpgradeBanner, upgradeHref } from '../../../components/billing/PlanGate'
import { usePlanEntitlements } from '../../../components/billing/PlanProvider'
import { minPlanForFeature } from '../../../lib/billing'
import {
  loadIntegrations,
  loadStripeConnectStatus,
  type IntegrationStatusRow,
} from '../../../lib/integration-status'
import {
  getStripeConnectPayoutReadiness,
  type StripeConnectReadinessInput,
} from '../../../lib/stripe-connect-readiness'

const integrations = [
  {
    id: 'stripe-payouts',
    name: 'Stripe payouts',
    description: 'Set up your payout account for agent-driven transaction revenue. Available on every Nexez plan.',
    status: 'Setup required',
    action: 'Set up payouts',
    href: '/dashboard/billing',
    icon: CreditCard,
    accent: 'cyan',
    requiresIntegrations: false,
  },
  {
    id: 'stripe-catalog',
    name: 'Stripe catalog',
    description: 'Import Stripe products and prices as offers, then keep catalog data in sync.',
    status: 'Available',
    action: 'Import in Tools',
    href: '/dashboard/tools',
    icon: ShoppingCart,
    accent: 'cyan',
    requiresIntegrations: true,
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Turn your event types into bookable offers with direct scheduling links.',
    status: 'Available',
    action: 'Import via Tools',
    href: '/dashboard/tools',
    icon: Calendar,
    accent: 'violet',
    requiresIntegrations: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Connect with OAuth and sync live free/busy windows without reading event titles or descriptions.',
    status: 'Available',
    action: 'Open listings',
    href: '/dashboard',
    icon: Calendar,
    accent: 'blue',
    requiresIntegrations: true,
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    description: 'Authorize read-only catalog, inventory, and order access from your WooCommerce store.',
    status: 'Available',
    action: 'Open listings',
    href: '/dashboard',
    icon: ShoppingCart,
    accent: 'purple',
    requiresIntegrations: true,
  },
  {
    id: 'servicem8',
    name: 'ServiceM8',
    description: 'Import active job templates and verify live job access for home-service operations.',
    status: 'Available',
    action: 'Open listings',
    href: '/dashboard',
    icon: Workflow,
    accent: 'blue',
    requiresIntegrations: true,
  },
  {
    id: 'automation',
    name: 'Zapier-compatible webhooks',
    description: 'Send signed confirmed-booking and checkout signals to a Zapier Catch Hook, Make, or your own system.',
    status: 'Available',
    action: 'Connect',
    href: '/dashboard/settings',
    icon: Workflow,
    accent: 'zinc',
    requiresIntegrations: true,
  },
  {
    id: 'shopify-app',
    name: 'Shopify App Store',
    description: 'Install Nexez from Shopify admin for catalog sync and storefront agent artifacts. Available on every plan.',
    status: 'Every plan',
    action: 'Installation steps',
    href: '/dashboard/shopify',
    icon: ShoppingCart,
    accent: 'purple',
    requiresIntegrations: false,
  },
  {
    id: 'shopify-admin',
    name: 'Shopify Admin import',
    description: 'Import and re-sync a catalog with manually entered Shopify Admin API credentials. Requires Pro.',
    status: 'Available',
    action: 'Import in Tools',
    href: '/dashboard/tools',
    icon: ShoppingCart,
    accent: 'purple',
    requiresIntegrations: true,
  },
  {
    id: 'square',
    name: 'Square',
    description: 'Import POS and inventory context for mobile, wellness, and local services.',
    status: 'Available',
    action: 'Import in Tools',
    href: '/dashboard/tools',
    icon: SquareIcon,
    accent: 'blue',
    requiresIntegrations: true,
  },
  {
    id: 'acuity',
    name: 'Acuity Scheduling',
    description: 'Import live appointment types and duration as catalog offers through OAuth or a private API connection.',
    status: 'Available',
    action: 'Open listings',
    href: '/dashboard',
    icon: CalendarClock,
    accent: 'violet',
    requiresIntegrations: true,
  },
  {
    id: 'csv',
    name: 'Catalog File Import',
    description: 'Review and map CSV, TSV, TXT, JSON, XLS, or XLSX files before importing products, services, FAQs, and business details.',
    status: 'Manual',
    action: 'Upload',
    href: '/create?import=catalog',
    icon: Download,
    accent: 'zinc',
    requiresIntegrations: false,
  },
] as const

export default function IntegrationsPage() {
  const entitlements = usePlanEntitlements()
  const plan = entitlements.planId
  const [calendlyConnection, setCalendlyConnection] = useState<{ lastSync: string; maskedToken: string } | null>(null)
  const [calendlyWebhook, setCalendlyWebhook] = useState<{ lastSaved: string } | null>(null)
  const [stripeConnection, setStripeConnection] = useState<{ lastImport: string } | null>(null)
  const [shopifyConnection, setShopifyConnection] = useState<{ lastImport: string } | null>(null)
  const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectReadinessInput>(null)
  const [stripeConnectLoaded, setStripeConnectLoaded] = useState(false)
  // Server-of-record status (cross-device), keyed by provider. localStorage stays
  // as an instant/offline fallback for connections made before this row landed.
  const [dbStatus, setDbStatus] = useState<Record<string, IntegrationStatusRow>>({})

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

    let cancelled = false
    void Promise.all([loadIntegrations(), loadStripeConnectStatus()]).then(([rows, connectStatus]) => {
      if (cancelled) return
      setDbStatus(Object.fromEntries(rows.map((row) => [row.provider, row])))
      setStripeConnectStatus(connectStatus)
      setStripeConnectLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const integrationsAllowed = entitlements.features.integrations === true
  const payoutReadiness = getStripeConnectPayoutReadiness(stripeConnectStatus)

  // Dynamic status: DB row (cross-device) wins, localStorage is the fallback.
  const dynamicIntegrations = integrations.map((int) => {
    if (int.id === 'stripe-payouts') {
      if (!stripeConnectLoaded) {
        return { ...int, status: 'Checking setup', action: 'Open Billing' }
      }
      if (payoutReadiness.ready) {
        return {
          ...int,
          status: 'Payouts ready',
          description: 'Your Stripe account can accept agent-driven charges and receive payouts.',
          action: 'Manage payouts',
        }
      }
      if (payoutReadiness.accountCreated) {
        return {
          ...int,
          status: 'Setup incomplete',
          description: 'Your Stripe account is saved, but charges and payouts must both be enabled before settlement is ready.',
          action: 'Finish setup',
        }
      }
      return int
    }

    if (int.id === 'calendly') {
      const pat = dbStatus['calendly']
      const wh = dbStatus['calendly_webhook']
      const hasPat = !!pat || !!calendlyConnection
      const hasWebhook = !!wh || !!calendlyWebhook
      if (hasPat || hasWebhook) {
        const parts: string[] = []
        if (hasPat) parts.push(`Token connected • ${fmtTime(pat?.last_event_at ?? calendlyConnection!.lastSync)}`)
        if (hasWebhook) parts.push(`Webhook • ${fmtTime(wh?.last_event_at ?? calendlyWebhook!.lastSaved)}`)
        return { ...int, status: 'Connected', description: parts.join(' • '), action: 'Manage in Tools' }
      }
    }

    if (int.id === 'stripe-catalog') {
      const row = dbStatus['stripe']
      if (row || stripeConnection) {
        return {
          ...int,
          status: 'Connected',
          description: `Connected • Last import ${fmtTime(row?.last_event_at ?? stripeConnection!.lastImport)}`,
          action: ['google-calendar', 'woocommerce', 'servicem8'].includes(int.id) ? 'Open listings' : 'Manage in Tools',
        }
      }
    }

    if (int.id === 'shopify-admin') {
      const row = dbStatus['shopify']
      if (row || shopifyConnection) {
        return {
          ...int,
          status: 'Connected',
          description: `Connected • Last import ${fmtTime(row?.last_event_at ?? shopifyConnection!.lastImport)}`,
          action: 'Manage in Tools',
        }
      }
    }

    if (int.id === 'square' || int.id === 'acuity' || int.id === 'google-calendar' || int.id === 'woocommerce' || int.id === 'servicem8') {
      const provider = int.id === 'google-calendar' ? 'google_calendar' : int.id
      const row = dbStatus[provider]
      if (row) {
        return {
          ...int,
          status: 'Connected',
          description: `Connected • Last import ${fmtTime(row.last_event_at)}`,
          action: 'Manage in Tools',
        }
      }
    }

    return int
  })

  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <UpgradeBanner
          feature="integrations"
          currentPlan={plan}
          title="Premium integrations"
          description="Manual catalog and scheduling connectors require Pro. Stripe payouts and the installed Shopify app stay available on every plan."
          className="mb-6"
        />
        <header className="surface-masthead">
          <p className="text-sm text-[var(--signal)]">Integrations &amp; imports</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Connect your tools. Import your offers.</h1>
          <p className="mt-4 max-w-3xl text-zinc-400">
            Set up transaction payouts or install the Shopify app on any plan. Pro and above can also connect manual
            catalog and scheduling credentials and keep listing data in sync automatically.
          </p>
          <div className="mt-4 max-w-3xl rounded-lg border border-[var(--signal)]/20 bg-[var(--signal)]/10 p-3 text-sm text-zinc-300">
            <span className="font-medium text-[var(--signal)]">New:</span> connect &amp; re-sync each integration right on the
            listing - open a listing&apos;s <span className="font-medium">Settings → Integrations</span> to connect once (stored
            securely) and re-sync anytime without re-entering the token. This page is your account-wide status overview.
          </div>
        </header>

        <div className="grid gap-8 py-8 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-5">
            <div>
              <h2 className="font-semibold">Why connect?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Live pricing and availability keep your listing accurate - which raises the trust signals agents use to
                recommend you.
              </p>
            </div>
            <div className="card !p-4 text-xs border-[var(--signal)]/20 bg-[var(--signal)]/10">
              <p className="font-medium text-[var(--signal)] mb-3">What each integration does</p>
              <div className="space-y-2 text-zinc-300 text-[11px]">
                <div className="flex justify-between gap-3"><span>Calendly</span><span className="text-right text-[var(--ready)]">Import, webhooks &amp; secrets</span></div>
                <div className="flex justify-between gap-3"><span>Stripe payouts</span><span className="text-right text-[var(--ready)]">Every plan</span></div>
                <div className="flex justify-between gap-3"><span>Stripe catalog</span><span className="text-right text-[var(--ready)]">Import &amp; live price sync</span></div>
                <div className="flex justify-between gap-3"><span>Shopify App Store</span><span className="text-right text-[var(--ready)]">Every plan</span></div>
                <div className="flex justify-between gap-3"><span>Shopify Admin API</span><span className="text-right text-[var(--ready)]">Manual import &amp; re-sync</span></div>
                <div className="flex justify-between gap-3"><span>Square / Acuity</span><span className="text-right text-[var(--ready)]">Live catalog import</span></div>
                <div className="flex justify-between gap-3"><span>Google Calendar</span><span className="text-right text-[var(--ready)]">Live free/busy via OAuth</span></div>
                <div className="flex justify-between gap-3"><span>WooCommerce</span><span className="text-right text-[var(--ready)]">Catalog, inventory &amp; orders</span></div>
                <div className="flex justify-between gap-3"><span>ServiceM8</span><span className="text-right text-[var(--ready)]">Job templates &amp; active jobs</span></div>
                <div className="flex justify-between gap-3"><span>Zapier / Make</span><span className="text-right text-[var(--ready)]">Signed booking and checkout signals</span></div>
              </div>
              <div className="mt-3 pt-2 border-t border-[var(--signal)]/30 text-[var(--signal)] text-[10px]">
                Outbound webhooks cover confirmed Calendly bookings and supported checkout signals.
              </div>
            </div>
          </aside>

          <section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dynamicIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  {...integration}
                  status={!integrationsAllowed && integration.requiresIntegrations && integration.status === 'Connected'
                    ? 'Paused by plan'
                    : integration.status}
                  locked={integration.requiresIntegrations && !integrationsAllowed}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-col justify-between gap-4 card !p-5 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-semibold">Prefer to enter things manually?</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  The visual builder lets you add offers, tiers, and FAQs in minutes - no connection required.
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
  locked = false,
}: {
  name: string
  description: string
  status: string
  action: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  locked?: boolean
}) {
  const connected = status === 'Connected' || status === 'Payouts ready'
  const needsAttention = status === 'Setup incomplete' || status === 'Paused by plan'
  const integrationsPlan = minPlanForFeature('integrations')

  return (
    <article className="card !p-5">
      <div className="flex items-start justify-between">
        <div
          className={`flex size-11 items-center justify-center rounded-lg ${
            accent === 'cyan'
              ? 'bg-[var(--signal)]/15 text-[var(--signal)]'
              : accent === 'violet'
                ? 'bg-[var(--signal)]/15 text-[var(--signal)]'
                : accent === 'purple'
                  ? 'bg-[var(--signal)]/15 text-[var(--signal)]'
                  : accent === 'blue'
                    ? 'bg-[var(--signal)]/15 text-[var(--signal)]'
                    : 'bg-white/10 text-zinc-200'
          }`}
        >
          <Icon className="size-5" />
        </div>
        <button className="min-h-[44px] min-w-[44px] rounded-md p-2 text-zinc-500 hover:bg-white/10 hover:text-white active:bg-white/10 md:p-1" aria-label={`${name} options`} title={`${name} options`}>
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <h3 className="mt-6 flex items-center gap-2 text-xl font-semibold">
        {name}
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--signal)]">
            <Lock className="size-3" /> {integrationsPlan.name}
          </span>
        )}
      </h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-400">{description}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <span
          className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${
            connected
              ? 'bg-[var(--ready)]/20 text-[var(--ready)]'
              : needsAttention
                ? 'bg-[var(--amber)]/10 text-[var(--amber)]'
                : 'bg-white/10 text-zinc-300'
          }`}
        >
          {connected ? <CheckCircle2 className="size-4" /> : <Settings className="size-4" />}
          {status}
        </span>
        {locked ? (
          // Gated for this plan - point straight at checkout instead of bouncing
          // through Tools to a teaser.
          <a href={upgradeHref(integrationsPlan.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--signal-solid)] px-3 py-2 text-center text-sm font-semibold text-white hover:opacity-90">
            <Lock className="size-3.5" /> Upgrade to connect
          </a>
        ) : (
          <a href={href} className="flex-1 rounded-md bg-white/15 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/20 active:bg-white/20">
            {action}
          </a>
        )}
      </div>
    </article>
  )
}
