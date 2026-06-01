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
    description: 'Sync bookings and availability directly into agent pages.',
    status: 'Available',
    action: 'Import',
    href: '/create?source=calendly',
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
    description: 'Sync product catalog, pricing, inventory, and product URLs.',
    status: 'Available',
    action: 'Connect',
    href: '/create',
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
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
              <p className="text-sm font-medium text-cyan-100">Next milestone</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Stripe first: import products and payment links into a draft page.
              </p>
            </div>
          </aside>

          <section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {integrations.map((integration) => (
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
