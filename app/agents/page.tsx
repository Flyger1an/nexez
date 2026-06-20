import type { Metadata } from 'next'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  ExternalLink,
  Globe2,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { CodeCopyButton } from '../../components/CodeCopyButton'
import {
  NEXEZ_OPENCLAW_PLUGIN,
  NEXEZ_OPENCLAW_SKILL,
  NEXEZ_TYPESCRIPT_SDK,
  buildAgentDistributionLinks,
} from '../../lib/agent-distribution'
import { agentRuntimeUrl, appUrl, marketingUrl } from '../../lib/site'

export const metadata: Metadata = {
  title: 'AI Agent Access',
  description:
    'Install the Nexez OpenClaw plugin and discovery skill, then use Nexez agent APIs, manifests, llms.txt, OpenAPI, and MCP discovery to find and act on agent-ready offers.',
  alternates: {
    canonical: marketingUrl('/agents'),
  },
}

const distribution = buildAgentDistributionLinks()

const installCards = [
  {
    label: 'Native tool plugin',
    title: NEXEZ_OPENCLAW_PLUGIN.displayName,
    version: NEXEZ_OPENCLAW_PLUGIN.version,
    command: NEXEZ_OPENCLAW_PLUGIN.installCommand,
    copy: NEXEZ_OPENCLAW_PLUGIN.purpose,
  },
  {
    label: 'Discovery skill',
    title: NEXEZ_OPENCLAW_SKILL.displayName,
    version: NEXEZ_OPENCLAW_SKILL.version,
    command: NEXEZ_OPENCLAW_SKILL.installCommand,
    copy: NEXEZ_OPENCLAW_SKILL.purpose,
  },
]

const endpoints = [
  {
    label: 'Search',
    href: agentRuntimeUrl('/api/agent-search?q=strategy%20session'),
    value: `${distribution.runtime_base_url}/api/agent-search?q={query}`,
    copy: 'Find matching pages and offer-level actions from a buyer request.',
  },
  {
    label: 'Index',
    href: distribution.agent_index_url,
    value: distribution.agent_index_url,
    copy: 'List published pages, manifests, readiness, offers, and checkout URLs.',
  },
  {
    label: 'LLM guide',
    href: distribution.llms_url,
    value: distribution.llms_url,
    copy: 'Plain-text global context for agents that read llms.txt first.',
  },
  {
    label: 'OpenAPI',
    href: distribution.openapi_url,
    value: distribution.openapi_url,
    copy: 'Schemas and operation IDs for agent builders and action catalogs.',
  },
  {
    label: 'MCP catalog',
    href: distribution.mcp_discovery_url,
    value: distribution.mcp_discovery_url,
    copy: 'Discovery catalog for pages exposing MCP-compatible resources.',
  },
  {
    label: 'Capabilities',
    href: distribution.capabilities_url,
    value: distribution.capabilities_url,
    copy: 'Compact manifest describing Nexez endpoints, safety posture, and distribution.',
  },
]

const workflow = [
  {
    title: 'Search by buyer intent',
    copy: 'Use the directory, plugin tool, or search API with natural buyer language.',
    sample: 'Find a Chicago consultant for a one-week growth audit.',
  },
  {
    title: 'Read the page manifest',
    copy: 'Fetch agent.json or llms.txt for seller context, offers, FAQs, policies, and direct actions.',
    sample: '/{slug}/agent.json',
  },
  {
    title: 'Validate before acting',
    copy: 'Dry-run checkout or negotiation so the agent can confirm the handoff before money or contact occurs.',
    sample: 'POST /api/checkout { dryRun: true }',
  },
  {
    title: 'Hand off with approval',
    copy: 'After user approval, open checkout, submit negotiation terms, or route to the seller action URL.',
    sample: 'checkout, negotiate, book, or contact',
  },
]

const safetyRules = [
  'Public discovery requires no secret.',
  'Use dry-run validation before checkout or negotiation.',
  'Do not infer private seller rules from public constraints.',
  'Ask for buyer approval before spending money or contacting a seller.',
]

const manifestPreview = {
  schema_version: 'nexez.agent-access.v1',
  docs_url: distribution.docs_url,
  runtime_base_url: distribution.runtime_base_url,
  openclaw: {
    plugin: {
      name: NEXEZ_OPENCLAW_PLUGIN.name,
      version: NEXEZ_OPENCLAW_PLUGIN.version,
      install: NEXEZ_OPENCLAW_PLUGIN.installCommand,
    },
    skill: {
      slug: NEXEZ_OPENCLAW_SKILL.slug,
      version: NEXEZ_OPENCLAW_SKILL.version,
      install: NEXEZ_OPENCLAW_SKILL.installCommand,
    },
  },
  sdks: {
    typescript: {
      name: NEXEZ_TYPESCRIPT_SDK.name,
      version: NEXEZ_TYPESCRIPT_SDK.version,
      status: NEXEZ_TYPESCRIPT_SDK.status,
      source: NEXEZ_TYPESCRIPT_SDK.sourcePath,
    },
  },
  endpoints: {
    search: distribution.agent_search_url_template,
    index: distribution.agent_index_url,
    llms: distribution.llms_url,
    openapi: distribution.openapi_url,
    mcp: distribution.mcp_discovery_url,
  },
}

const manifestText = JSON.stringify(manifestPreview, null, 2)
const sdkExample = `import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient()

const matches = await nexez.search('book a strategy session next week', {
  location: 'Chicago, IL',
  limit: 5,
})

const first = matches.results[0]
const page = await nexez.getAgentPage(first.page.slug)

await nexez.validateCheckout({
  slug: first.page.slug,
  offer: first.offer?.key ?? 'services-0',
  query: 'Buyer wants a strategy session next week.',
  buyerAgent: 'buyer-agent',
})`

export default function AgentAccessPage() {
  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            name: 'Nexez AI Agent Access',
            description: metadata.description,
            url: marketingUrl('/agents'),
            publisher: {
              '@type': 'Organization',
              name: 'Nexez',
              url: marketingUrl('/'),
            },
            about: ['AI agent commerce', 'OpenClaw', 'llms.txt', 'MCP', 'OpenAPI'],
          }),
        }}
      />

      <section className="relative overflow-hidden border-b border-border bg-white/[0.015]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
          <div className="nx-grid" />
        </div>
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.88fr)_minmax(420px,0.72fr)] lg:items-center lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--signal)]">
              <Bot className="size-3.5" />
              AI Agent Access
            </div>
            <h1 className="mt-6 max-w-4xl text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              Give agents a clean path into <span className="nx-accent-text">Nexez.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Install the OpenClaw plugin or discovery skill, then search Nexez pages, fetch manifests, validate
              handoffs, and route buyer intent through structured public endpoints.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#install" className="btn-primary h-11 px-5">
                Install agent access
                <ArrowRight className="size-4" />
              </a>
              <a href={agentRuntimeUrl('/agent-pages.json')} className="btn-secondary h-11 px-5">
                Open agent index
                <ExternalLink className="size-4" />
              </a>
            </div>
          </div>

          <div className="nx-glass-panel overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-border bg-black/40">
                  <Terminal className="size-4 text-[var(--signal)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">agent-access.json</p>
                  <p className="font-mono text-xs text-muted-foreground">public discovery contract</p>
                </div>
              </div>
              <CodeCopyButton text={manifestText} />
            </div>
            <pre className="max-h-[480px] max-w-full overflow-auto p-5 text-left font-mono text-[11px] leading-5 text-[var(--fg-muted-2)]">
              <code>{manifestText}</code>
            </pre>
          </div>
        </div>
      </section>

      <section id="install" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium text-[var(--signal)]">Install paths</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Use tools, instructions, or both.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              The plugin gives agents callable tools. The skill gives agents the discovery logic and safety rubric.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {installCards.map((card) => (
              <InstallCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
            <div>
              <p className="text-sm font-medium text-[var(--signal)]">Agent workflow</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                From request to safe handoff.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                Nexez is designed for agents that need to compare offers, explain why a seller fits, and only then
                request approval for checkout or negotiation.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {workflow.map((step, index) => (
                <FlowStep key={step.title} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-[var(--signal)]">Public machine surfaces</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
                Everything points to one source of truth.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                These endpoints stay on the public agent runtime so pages remain fast, crawlable, and separate from
                the authenticated app.
              </p>
            </div>
            <a href="/developers" className="btn-secondary h-10 px-4">
              Developer docs
              <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {endpoints.map((endpoint) => (
              <EndpointCard key={endpoint.label} {...endpoint} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--signal)]">SDK preview</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              Typed helpers for agent builders.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
              The TypeScript SDK source is in the Nexez repo today. It wraps search, manifest reads, checkout dry-runs,
              and negotiation handoffs so agent apps do not need to hand-roll endpoint plumbing.
            </p>
            <div className="mt-5 rounded-lg border border-border bg-white/[0.03] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {NEXEZ_TYPESCRIPT_SDK.name} · v{NEXEZ_TYPESCRIPT_SDK.version}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{NEXEZ_TYPESCRIPT_SDK.purpose}</p>
            </div>
          </div>

          <div className="nx-glass-panel overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md border border-border bg-black/40">
                  <Code2 className="size-4 text-[var(--signal)]" />
                </div>
                <div>
                  <p className="text-sm font-medium">agent-sdk.ts</p>
                  <p className="font-mono text-xs text-muted-foreground">search · manifest · dry-run</p>
                </div>
              </div>
              <CodeCopyButton text={sdkExample} />
            </div>
            <pre className="max-w-full overflow-auto p-5 text-left font-mono text-[11px] leading-5 text-[var(--fg-muted-2)]">
              <code>{sdkExample}</code>
            </pre>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:py-20 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="nx-glass-panel p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md border border-[var(--ready)]/30 bg-[var(--ready)]/10">
                <ShieldCheck className="size-5 text-[var(--ready)]" />
              </div>
              <div>
                <p className="font-medium">Safety posture</p>
                <p className="text-sm text-muted-foreground">Open for discovery. Careful for actions.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {safetyRules.map((rule) => (
                <div key={rule} className="flex gap-3 rounded-lg border border-border bg-white/[0.03] p-4">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" />
                  <p className="text-sm leading-6 text-muted-foreground">{rule}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid content-between gap-4">
            <div className="nx-tile p-6">
              <div className="flex items-center gap-3">
                <Search className="size-5 text-[var(--signal)]" />
                <p className="font-medium">For buyer agents</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Search by outcome, location, budget signal, or service type. Nexez returns pages with structured
                offers, trust signals, and direct next actions.
              </p>
            </div>
            <div className="nx-tile p-6">
              <div className="flex items-center gap-3">
                <Globe2 className="size-5 text-[var(--signal)]" />
                <p className="font-medium">For seller pages</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Public pages remain on the agent runtime, while the marketing site and dashboard stay on their own
                domains. That split protects crawlability and signed-in workflows.
              </p>
            </div>
            <div className="nx-tile p-6">
              <div className="flex items-center gap-3">
                <Code2 className="size-5 text-[var(--signal)]" />
                <p className="font-medium">For builders</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Use OpenAPI, MCP discovery, and the OpenClaw plugin together when you need typed actions plus readable
                context.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-5 py-20 text-center md:py-24">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] md:text-6xl">
            Ready for the agent web.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Publish a seller page, make it visible in the directory, and let agents discover the offer through the
            clean runtime.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={appUrl('/create')} className="btn-primary h-11 px-5">
              Create a page
              <ArrowRight className="size-4" />
            </a>
            <a href="/discovery" className="btn-secondary h-11 px-5">
              Browse discovery
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

function InstallCard({
  label,
  title,
  version,
  command,
  copy,
}: {
  label: string
  title: string
  version: string
  command: string
  copy: string
}) {
  return (
    <div className="nx-glass-panel min-w-0 p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--signal)]">{label}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
        </div>
        <span className="w-fit shrink-0 rounded-md border border-border bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-muted-foreground">
          v{version}
        </span>
      </div>
      <div className="mt-5 min-w-0 max-w-full rounded-lg border border-border bg-black/45">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-mono text-[11px] text-muted-foreground">Terminal</span>
          <CodeCopyButton text={command} />
        </div>
        <pre className="max-w-full overflow-x-auto p-4 font-mono text-xs text-[var(--signal)]">
          <code>{command}</code>
        </pre>
      </div>
    </div>
  )
}

function FlowStep({
  index,
  title,
  copy,
  sample,
}: {
  index: number
  title: string
  copy: string
  sample: string
}) {
  return (
    <div className="nx-tile p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-8 items-center justify-center rounded-full border border-[var(--signal)]/30 bg-[var(--signal)]/10 font-mono text-xs text-[var(--signal)]">
          {String(index).padStart(2, '0')}
        </div>
        <ArrowRight className="size-4 text-white/20" />
      </div>
      <h3 className="mt-5 text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
      <code className="mt-4 block rounded-md border border-border bg-black/35 px-3 py-2 font-mono text-[11px] text-[var(--fg-muted-2)]">
        {sample}
      </code>
    </div>
  )
}

function EndpointCard({
  label,
  href,
  value,
  copy,
}: {
  label: string
  href: string
  value: string
  copy: string
}) {
  return (
    <a
      href={href}
      className="group rounded-lg border border-border bg-white/[0.03] p-5 transition-colors hover:border-[var(--signal)]/40 hover:bg-white/[0.05]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <ExternalLink className="size-4 text-muted-foreground transition-colors group-hover:text-[var(--signal)]" />
      </div>
      <p className="mt-3 min-h-[3rem] text-sm leading-6 text-muted-foreground">{copy}</p>
      <code className="mt-4 block break-all rounded-md border border-border bg-black/30 px-3 py-2 font-mono text-[11px] text-[var(--fg-muted-2)]">
        {value}
      </code>
    </a>
  )
}
