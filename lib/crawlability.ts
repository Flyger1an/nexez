// B6 — Agent crawlability test for hosted (custom-domain) agent pages.
// Pure scoring + robots parsing live here so they're unit-testable; the route
// does the fetching and feeds these functions.

/** AI/agent crawlers we care about reaching the page. */
export const AGENT_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
] as const

export type AgentBot = (typeof AGENT_BOTS)[number]

/**
 * Best-effort robots.txt evaluation: is the root path `/` allowed for each
 * agent bot? Honors the most specific matching User-agent group, falling back
 * to `*`. A `Disallow: /` (or empty Allow override) blocks the bot.
 */
export function parseRobotsForAgentBots(
  robotsTxt: string | null,
): Record<AgentBot, boolean> {
  const result = {} as Record<AgentBot, boolean>
  // No robots.txt => everything is allowed by convention.
  if (!robotsTxt || !robotsTxt.trim()) {
    for (const bot of AGENT_BOTS) result[bot] = true
    return result
  }

  // Build groups: map of user-agent (lowercased) -> array of disallow paths.
  const groups = new Map<string, string[]>()
  let currentAgents: string[] = []
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.split('#')[0]!.trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    const key = (field || '').trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      currentAgents = [value.toLowerCase()]
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), [])
    } else if (key === 'disallow' && currentAgents.length) {
      for (const a of currentAgents) {
        const arr = groups.get(a) || []
        arr.push(value)
        groups.set(a, arr)
      }
    }
  }

  const blocksRoot = (disallows: string[] | undefined): boolean => {
    if (!disallows) return false
    // A bare "Disallow:" (empty) means allow-all; "Disallow: /" blocks root.
    return disallows.some((d) => d === '/' || d === '/*')
  }

  for (const bot of AGENT_BOTS) {
    const specific = groups.get(bot.toLowerCase())
    const wildcard = groups.get('*')
    const disallows = specific ?? wildcard
    result[bot] = !blocksRoot(disallows)
  }

  return result
}

export type CrawlabilitySignals = {
  status: number
  responseMs: number
  hasJsonLd: boolean
  hasTitle: boolean
  hasMetaDescription: boolean
  hasH1: boolean
  agentJsonOk: boolean
  llmsTxtOk: boolean
  robots: Record<AgentBot, boolean>
}

export type CrawlCheck = {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export type CrawlabilityReport = {
  score: number
  checks: CrawlCheck[]
}

/** Deterministic 0-100 crawlability score + per-check breakdown (pure). */
export function evaluateCrawlability(signals: CrawlabilitySignals): CrawlabilityReport {
  const checks: CrawlCheck[] = []

  const reachable = signals.status >= 200 && signals.status < 400
  checks.push({
    id: 'reachable',
    label: 'Page reachable (HTTP 2xx/3xx)',
    status: reachable ? 'pass' : 'fail',
    detail: `HTTP ${signals.status || 0}`,
  })

  const fast = signals.responseMs > 0 && signals.responseMs <= 800
  checks.push({
    id: 'speed',
    label: 'Fast response (<800ms)',
    status: fast ? 'pass' : signals.responseMs <= 2000 ? 'warn' : 'fail',
    detail: signals.responseMs ? `${signals.responseMs}ms` : 'n/a',
  })

  checks.push({
    id: 'jsonld',
    label: 'Structured data (JSON-LD)',
    status: signals.hasJsonLd ? 'pass' : 'fail',
    detail: signals.hasJsonLd ? 'schema.org JSON-LD present' : 'No JSON-LD found',
  })

  const metaOk = signals.hasTitle && signals.hasMetaDescription && signals.hasH1
  checks.push({
    id: 'semantics',
    label: 'Semantic basics (title, description, h1)',
    status: metaOk ? 'pass' : signals.hasTitle ? 'warn' : 'fail',
    detail: [
      signals.hasTitle ? 'title✓' : 'title✗',
      signals.hasMetaDescription ? 'description✓' : 'description✗',
      signals.hasH1 ? 'h1✓' : 'h1✗',
    ].join(' '),
  })

  checks.push({
    id: 'agent_json',
    label: 'agent.json reachable at domain root',
    status: signals.agentJsonOk ? 'pass' : 'fail',
    detail: signals.agentJsonOk ? '/agent.json returns JSON' : '/agent.json not reachable',
  })

  checks.push({
    id: 'llms_txt',
    label: 'llms.txt present',
    status: signals.llmsTxtOk ? 'pass' : 'warn',
    detail: signals.llmsTxtOk ? '/llms.txt present' : '/llms.txt missing',
  })

  const blocked = AGENT_BOTS.filter((b) => !signals.robots[b])
  checks.push({
    id: 'robots',
    label: 'AI agents allowed by robots.txt',
    status: blocked.length === 0 ? 'pass' : blocked.length >= AGENT_BOTS.length ? 'fail' : 'warn',
    detail: blocked.length === 0 ? 'All known agent bots allowed' : `Blocked: ${blocked.join(', ')}`,
  })

  // Weighted score.
  const weights: Record<string, number> = {
    reachable: 25,
    jsonld: 20,
    agent_json: 20,
    robots: 15,
    semantics: 10,
    speed: 5,
    llms_txt: 5,
  }
  let score = 0
  for (const c of checks) {
    const w = weights[c.id] ?? 0
    score += c.status === 'pass' ? w : c.status === 'warn' ? w * 0.5 : 0
  }

  return { score: Math.round(score), checks }
}
