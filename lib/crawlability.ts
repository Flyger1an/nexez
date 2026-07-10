// Shared, deterministic agent-readiness scoring. Signal collection lives in
// lib/server/site-scan.ts so public and owner-facing scans cannot drift.

/** Current crawler/control tokens that materially affect agent discovery. */
export const AGENT_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
] as const

export type AgentBot = (typeof AGENT_BOTS)[number]

type RobotsRule = { allow: boolean; pattern: string }
type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

function patternMatchLength(pattern: string, path: string): number {
  if (!pattern) return -1
  const anchored = pattern.endsWith('$')
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  try {
    return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path)
      ? pattern.replace(/[*$]/g, '').length
      : -1
  } catch {
    return -1
  }
}

/** Group-aware robots evaluation with Allow overrides and longest-rule wins. */
export function parseRobotsForAgentBots(robotsTxt: string | null): Record<AgentBot, boolean> {
  const result = {} as Record<AgentBot, boolean>
  if (!robotsTxt || !robotsTxt.trim()) {
    for (const bot of AGENT_BOTS) result[bot] = true
    return result
  }

  const groups: RobotsGroup[] = []
  let group: RobotsGroup | null = null
  let sawRule = false

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]!.trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (key === 'user-agent') {
      if (!group || sawRule) {
        group = { agents: [], rules: [] }
        groups.push(group)
        sawRule = false
      }
      if (value) group.agents.push(value.toLowerCase())
      continue
    }

    if ((key === 'allow' || key === 'disallow') && group?.agents.length) {
      sawRule = true
      if (value) group.rules.push({ allow: key === 'allow', pattern: value })
    }
  }

  for (const bot of AGENT_BOTS) {
    const token = bot.toLowerCase()
    const matching = groups
      .map((candidate) => ({
        candidate,
        specificity: Math.max(
          ...candidate.agents.map((agent) =>
            agent === '*' ? 0 : token === agent || token.startsWith(agent) ? agent.length : -1,
          ),
        ),
      }))
      .filter((entry) => entry.specificity >= 0)
    const mostSpecific = matching.length ? Math.max(...matching.map((entry) => entry.specificity)) : -1
    const rules = matching
      .filter((entry) => entry.specificity === mostSpecific)
      .flatMap((entry) => entry.candidate.rules)

    let winner: { allow: boolean; length: number } | null = null
    for (const rule of rules) {
      const length = patternMatchLength(rule.pattern, '/')
      if (length < 0) continue
      if (!winner || length > winner.length || (length === winner.length && rule.allow)) {
        winner = { allow: rule.allow, length }
      }
    }
    result[bot] = winner?.allow ?? true
  }

  return result
}

export type CrawlDimension = 'discovery' | 'understanding' | 'transactability' | 'trust'

export type CrawlabilitySignals = {
  status: number
  responseMs: number
  https: boolean
  hasJsonLd: boolean
  validJsonLd: boolean
  schemaTypes: string[]
  hasTitle: boolean
  hasMetaDescription: boolean
  hasH1: boolean
  hasBusinessIdentity: boolean
  hasOfferSchema: boolean
  hasStructuredPrice: boolean
  hasVisiblePrice: boolean
  hasActionPath: boolean
  hasStructuredAction: boolean
  hasStructuredAvailability: boolean
  hasVisibleAvailability: boolean
  hasOfferDetails: boolean
  hasContact: boolean
  hasPolicies: boolean
  hasFreshnessSignal: boolean
  agentJsonOk: boolean
  wellKnownAgentJsonOk: boolean
  wellKnownAgentCardOk: boolean
  mcpJsonOk: boolean
  openApiJsonOk: boolean
  llmsTxtOk: boolean
  robots: Record<AgentBot, boolean>
}

export type CrawlCheck = {
  id: string
  dimension: CrawlDimension
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export type CrawlDimensionScore = { label: string; score: number }

export type CrawlabilityReport = {
  version: 2
  score: number
  dimensions: Record<CrawlDimension, CrawlDimensionScore>
  checks: CrawlCheck[]
}

export const DIMENSION_WEIGHTS: Record<CrawlDimension, number> = {
  discovery: 25,
  understanding: 25,
  transactability: 35,
  trust: 15,
}

const DIMENSION_LABELS: Record<CrawlDimension, string> = {
  discovery: 'Discovery',
  understanding: 'Understanding',
  transactability: 'Transactability',
  trust: 'Trust',
}

/** Per-check weights sum to 100 and roll up to the four dimensions. */
export const CHECK_WEIGHTS: Record<string, number> = {
  reachable: 8,
  speed: 3,
  robots: 5,
  agent_docs: 6,
  llms_txt: 3,
  semantics: 4,
  jsonld: 6,
  business_identity: 5,
  offer_schema: 10,
  pricing: 10,
  action_path: 10,
  availability: 5,
  offer_details: 5,
  structured_action: 5,
  https: 4,
  contact: 4,
  policies: 4,
  freshness: 3,
}

function contribution(check: CrawlCheck): number {
  const weight = CHECK_WEIGHTS[check.id] ?? 0
  return check.status === 'pass' ? weight : check.status === 'warn' ? weight * 0.5 : 0
}

export function scoreFromChecks(checks: CrawlCheck[]): number {
  return Math.round(checks.reduce((sum, check) => sum + contribution(check), 0))
}

export function dimensionsFromChecks(checks: CrawlCheck[]): Record<CrawlDimension, CrawlDimensionScore> {
  return (Object.keys(DIMENSION_WEIGHTS) as CrawlDimension[]).reduce(
    (result, dimension) => {
      const earned = checks
        .filter((check) => check.dimension === dimension)
        .reduce((sum, check) => sum + contribution(check), 0)
      result[dimension] = {
        label: DIMENSION_LABELS[dimension],
        score: Math.round((earned / DIMENSION_WEIGHTS[dimension]) * 100),
      }
      return result
    },
    {} as Record<CrawlDimension, CrawlDimensionScore>,
  )
}

/** Deterministic V2 score based on evidence, not keyword or file presence alone. */
export function evaluateCrawlability(signals: CrawlabilitySignals): CrawlabilityReport {
  const checks: CrawlCheck[] = []
  const add = (check: CrawlCheck) => checks.push(check)
  const reachable = signals.status >= 200 && signals.status < 400

  add({ id: 'reachable', dimension: 'discovery', label: 'Public page reachable', status: reachable ? 'pass' : 'fail', detail: `HTTP ${signals.status || 0}` })
  add({
    id: 'speed', dimension: 'discovery', label: 'Fast server response',
    status: signals.responseMs > 0 && signals.responseMs <= 800 ? 'pass' : signals.responseMs <= 2000 ? 'warn' : 'fail',
    detail: signals.responseMs ? `${signals.responseMs}ms` : 'No response',
  })

  const blocked = AGENT_BOTS.filter((bot) => !signals.robots[bot])
  add({
    id: 'robots', dimension: 'discovery', label: 'Agent crawler access',
    status: blocked.length === 0 ? 'pass' : blocked.length >= AGENT_BOTS.length ? 'fail' : 'warn',
    detail: blocked.length === 0 ? 'All evaluated agent crawlers are allowed' : `Blocked: ${blocked.join(', ')}`,
  })

  const docs = [
    signals.agentJsonOk && 'agent.json',
    signals.wellKnownAgentJsonOk && 'well-known agent.json',
    signals.wellKnownAgentCardOk && 'A2A agent card',
    signals.mcpJsonOk && 'MCP server card',
    signals.openApiJsonOk && 'OpenAPI',
  ].filter(Boolean) as string[]
  add({
    id: 'agent_docs', dimension: 'discovery', label: 'Machine-readable agent endpoints',
    status: docs.length >= 2 ? 'pass' : docs.length === 1 ? 'warn' : 'fail',
    detail: docs.length ? docs.join(', ') : 'No meaningful agent manifest or API description found',
  })
  add({
    id: 'llms_txt', dimension: 'discovery', label: 'LLM discovery guide',
    status: signals.llmsTxtOk ? 'pass' : 'warn',
    detail: signals.llmsTxtOk ? '/llms.txt contains readable guidance' : '/llms.txt is missing or empty',
  })

  const semanticCount = [signals.hasTitle, signals.hasMetaDescription, signals.hasH1].filter(Boolean).length
  add({
    id: 'semantics', dimension: 'understanding', label: 'Semantic page basics',
    status: semanticCount === 3 ? 'pass' : semanticCount >= 1 ? 'warn' : 'fail',
    detail: `${signals.hasTitle ? 'title' : 'no title'}, ${signals.hasMetaDescription ? 'description' : 'no description'}, ${signals.hasH1 ? 'h1' : 'no h1'}`,
  })
  add({
    id: 'jsonld', dimension: 'understanding', label: 'Valid structured data',
    status: signals.validJsonLd ? 'pass' : signals.hasJsonLd ? 'warn' : 'fail',
    detail: signals.validJsonLd
      ? `Parsed JSON-LD${signals.schemaTypes.length ? `: ${signals.schemaTypes.slice(0, 5).join(', ')}` : ''}`
      : signals.hasJsonLd ? 'JSON-LD exists but could not be parsed' : 'No JSON-LD found',
  })
  add({
    id: 'business_identity', dimension: 'understanding', label: 'Structured business identity',
    status: signals.hasBusinessIdentity ? 'pass' : 'fail',
    detail: signals.hasBusinessIdentity ? 'Business name and identity are machine-readable' : 'No structured Organization or business identity found',
  })
  add({
    id: 'offer_schema', dimension: 'understanding', label: 'Structured offers',
    status: signals.hasOfferSchema ? 'pass' : 'fail',
    detail: signals.hasOfferSchema ? 'Offer, Product, or Service schema found' : 'No real Offer, Product, or Service schema found',
  })

  add({
    id: 'pricing', dimension: 'transactability', label: 'Machine-readable pricing',
    status: signals.hasStructuredPrice ? 'pass' : signals.hasVisiblePrice ? 'warn' : 'fail',
    detail: signals.hasStructuredPrice ? 'Structured price or price specification found' : signals.hasVisiblePrice ? 'Price is visible but not structured' : 'No price signal found',
  })
  add({
    id: 'action_path', dimension: 'transactability', label: 'Direct buyer action',
    status: signals.hasActionPath ? 'pass' : 'fail',
    detail: signals.hasActionPath ? 'A buy, book, subscribe, or quote path is visible' : 'No direct purchase, booking, or lead action found',
  })
  add({
    id: 'availability', dimension: 'transactability', label: 'Availability or fulfillment signal',
    status: signals.hasStructuredAvailability ? 'pass' : signals.hasVisibleAvailability ? 'warn' : 'fail',
    detail: signals.hasStructuredAvailability ? 'Availability is structured' : signals.hasVisibleAvailability ? 'Availability is visible but not structured' : 'No availability, booking, or fulfillment signal found',
  })
  add({
    id: 'offer_details', dimension: 'transactability', label: 'Concrete offer details',
    status: signals.hasOfferDetails ? 'pass' : signals.hasOfferSchema ? 'warn' : 'fail',
    detail: signals.hasOfferDetails ? 'Offer name and scope are explicit' : 'Offer scope or description is incomplete',
  })
  add({
    id: 'structured_action', dimension: 'transactability', label: 'Structured action target',
    status: signals.hasStructuredAction ? 'pass' : signals.hasActionPath ? 'warn' : 'fail',
    detail: signals.hasStructuredAction ? 'Action URL is exposed in structured data' : signals.hasActionPath ? 'Action exists only in page markup' : 'No machine-readable action target found',
  })

  add({ id: 'https', dimension: 'trust', label: 'Secure transport', status: signals.https ? 'pass' : 'fail', detail: signals.https ? 'HTTPS enabled' : 'Page is not served over HTTPS' })
  add({
    id: 'contact', dimension: 'trust', label: 'Contact and support path',
    status: signals.hasContact ? 'pass' : 'fail',
    detail: signals.hasContact ? 'A contact or support path is exposed' : 'No contact or support path found',
  })
  add({
    id: 'policies', dimension: 'trust', label: 'Buyer policies',
    status: signals.hasPolicies ? 'pass' : 'warn',
    detail: signals.hasPolicies ? 'Terms, privacy, return, refund, or cancellation policy found' : 'Buyer policies are not easy to locate',
  })
  add({
    id: 'freshness', dimension: 'trust', label: 'Content freshness signal',
    status: signals.hasFreshnessSignal ? 'pass' : 'warn',
    detail: signals.hasFreshnessSignal ? 'A recent modified or published date is exposed' : 'No reliable freshness date found',
  })

  return { version: 2, score: scoreFromChecks(checks), dimensions: dimensionsFromChecks(checks), checks }
}
