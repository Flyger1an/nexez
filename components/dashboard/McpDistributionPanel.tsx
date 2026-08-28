import { Bot, ExternalLink, RadioTower } from 'lucide-react'
import type { McpDemandSnapshot } from '../../lib/mcp-demand'

export function McpDistributionPanel({ snapshot }: { snapshot: McpDemandSnapshot }) {
  return (
    <section className="border-t border-border py-8" aria-labelledby="external-agent-reach-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 size-5 shrink-0 text-[var(--signal)]" />
          <div>
            <h2 id="external-agent-reach-heading" className="text-lg font-semibold">External agent reach</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">
              See whether compatible AI apps can find Nexez and turn validated requests into real activity.
              Being listed in a registry does not count as a customer or sale.
            </p>
          </div>
        </div>
        <a
          href="https://registry.modelcontextprotocol.io/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 w-fit items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-[var(--fg-soft)] transition hover:bg-white/[0.06] hover:text-foreground"
        >
          Official MCP Registry <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <EvidenceCard
          label="Public MCP endpoint"
          status={snapshot.endpoint.status}
          title={snapshot.endpoint.status === 'ready' ? 'Ready for compatible AI apps' : 'Needs attention'}
          detail={snapshot.endpoint.detail}
        />
        <EvidenceCard
          label="Official registry"
          status={snapshot.registry.status === 'published' ? 'ready' : snapshot.registry.status}
          title={snapshot.registry.status === 'published'
            ? `Published${snapshot.registry.version ? ` as version ${snapshot.registry.version}` : ''}`
            : snapshot.registry.status === 'unpublished'
              ? 'Owner publish step remaining'
              : 'Registry check unavailable'}
          detail={snapshot.registry.detail}
        />
      </div>

      {!snapshot.available ? (
        <div className="mt-4 rounded-lg border border-border bg-white/[0.025] px-5 py-6 text-sm text-[var(--fg-muted)]">
          External agent activity is temporarily unavailable. Endpoint and registry checks remain independent above.
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="MCP requests" value={snapshot.totalCalls} />
            <Metric label="Tool uses" value={snapshot.toolCalls} />
            <Metric label="Ready handoffs" value={snapshot.actionReady} />
            <Metric label="Commerce records" value={snapshot.attributedCommerce} />
            <Metric label="Live money records" value={snapshot.liveCommerce} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="Reported AI app families"
              empty="No compatible AI app has called the public MCP endpoint in this period."
              rows={snapshot.clients.map((client) => ({
                key: client.family,
                label: clientLabel(client.family),
                value: client.calls,
              }))}
            />
            <Breakdown
              title="Tools used"
              empty="No MCP tool has been used in this period."
              rows={snapshot.tools.map((tool) => ({
                key: tool.name,
                label: toolLabel(tool.name),
                value: tool.calls,
                detail: tool.actionReady ? `${tool.actionReady} ready handoff${tool.actionReady === 1 ? '' : 's'}` : undefined,
              }))}
            />
          </div>

          {snapshot.truncated ? (
            <p className="mt-3 text-xs leading-5 text-[var(--amber)]">
              Showing the newest 5,000 MCP requests. Actual totals may be higher.
            </p>
          ) : null}
        </>
      )}

      <p className="mt-3 text-xs leading-5 text-[var(--fg-muted-2)]">
        This report stores anonymous event totals and a reference ID. It does not store prompts, request text,
        buyer details, IP addresses, browser details, or device details.
      </p>
    </section>
  )
}

function EvidenceCard({
  label,
  status,
  title,
  detail,
}: {
  label: string
  status: 'ready' | 'invalid' | 'unavailable' | 'unpublished'
  title: string
  detail: string
}) {
  const color = status === 'ready'
    ? 'border-[var(--ready)]/25 bg-[var(--ready)]/5 text-[var(--ready)]'
    : status === 'unpublished'
      ? 'border-[var(--amber)]/25 bg-[var(--amber)]/5 text-[var(--amber)]'
      : 'border-border bg-white/[0.025] text-[var(--fg-muted)]'
  return (
    <div className={`rounded-lg border px-5 py-4 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]">
        <RadioTower className="size-3.5" /> {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{detail}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-white/[0.025] px-4 py-3">
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function Breakdown({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: Array<{ key: string; label: string; value: number; detail?: string }>
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white/[0.025]">
      <h3 className="border-b border-border px-4 py-3 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <div className="divide-y divide-border">
          {rows.slice(0, 8).map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <span className="text-[var(--fg-soft)]">{row.label}</span>
                {row.detail ? <span className="ml-2 text-xs text-[var(--ready)]">{row.detail}</span> : null}
              </div>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-5 text-xs leading-5 text-[var(--fg-muted)]">{empty}</p>
      )}
    </div>
  )
}

function clientLabel(value: string) {
  const labels: Record<string, string> = {
    claude: 'Claude',
    chatgpt: 'ChatGPT',
    cursor: 'Cursor',
    vscode: 'Visual Studio Code',
    openclaw: 'OpenClaw',
    gemini: 'Gemini',
    mcp_inspector: 'MCP Inspector',
    mcp_sdk: 'MCP SDK',
    other: 'Other compatible apps',
  }
  return labels[value] ?? 'Other compatible apps'
}

function toolLabel(value: string) {
  const labels: Record<string, string> = {
    nexez_search: 'Search sellers',
    nexez_directory: 'Browse directory',
    nexez_get_page: 'Open seller details',
    nexez_validate_checkout: 'Validate checkout',
    nexez_validate_negotiation: 'Validate negotiation',
  }
  return labels[value] ?? value
}
