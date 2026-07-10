import 'server-only'
import { llmComplete, isLlmConfigured } from '../llm'
import { evaluateCrawlability, scoreFromChecks, AGENT_BOTS, type CrawlCheck } from '../crawlability'
import { gatherSiteSignals } from './site-scan'

/**
 * The GATED deep report: the deterministic scanner (structural, reproducible) as
 * the backbone, PLUS an LLM pass that refines ONLY the content/comprehension
 * dimension (the `semantics` check the anonymous scanner grades with a crude
 * regex) and adds an "agent's-eye read" + the single highest-leverage fix.
 *
 * The LLM is OPTIONAL: if it's not configured, over budget, errors, or the caller
 * isn't entitled (llm=false), everything degrades to the exact deterministic
 * report the anonymous /api/scan returns (llmAssisted:false). Never changes the
 * anonymous scanner — this is only reachable behind auth + the aiFeatures gate.
 */

export type DeepScanResult = {
  ok: true
  url: string
  origin: string
  elapsedMs: number
  score: number
  checks: CrawlCheck[]
  agentBots: typeof AGENT_BOTS
  blockedBots: string[]
  llmAssisted: boolean
  /** Present only when the LLM ran: what an AI agent understands + the top fix. */
  comprehension?: { score: number; agentRead: string; topFix: string }
}

type LlmComprehension = { score: number; agentRead: string; topFix: string }

const SYSTEM = [
  'You are an AI shopping agent evaluating whether you could TRANSACT with a business from its web page content alone.',
  'Judge only what an agent can parse: are the offers/services clear, are prices stated, is it obvious how to buy or book, is the value proposition unambiguous?',
  'Ignore visual design. Be strict — marketing fluff without concrete offers/prices scores low.',
  'Respond with ONLY a JSON object, no prose, no code fence:',
  '{"score": <0-100 integer>, "agentRead": "<2-3 sentences, first person as the agent, on what you understand + what is unclear>", "topFix": "<one concrete sentence: the single highest-impact change>"}',
].join('\n')

/** Tolerant JSON extraction — models sometimes wrap the object in prose/fences. */
export function parseComprehension(raw: string | null): LlmComprehension | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const score = typeof o.score === 'number' ? o.score : Number(o.score)
  const agentRead = typeof o.agentRead === 'string' ? o.agentRead.trim() : ''
  const topFix = typeof o.topFix === 'string' ? o.topFix.trim() : ''
  if (!Number.isFinite(score) || !agentRead) return null
  return { score: Math.max(0, Math.min(100, Math.round(score))), agentRead, topFix }
}

/** Map a 0-100 comprehension score to the content check's status band. */
function comprehensionStatus(score: number): CrawlCheck['status'] {
  return score >= 70 ? 'pass' : score >= 40 ? 'warn' : 'fail'
}

export async function runDeepScan(
  rawUrl: string,
  opts: { llm?: boolean } = {},
): Promise<DeepScanResult | { error: string }> {
  const gathered = await gatherSiteSignals(rawUrl)
  if ('error' in gathered) return gathered

  const { url, origin, elapsedMs, signals, robots, pageText } = gathered
  const report = evaluateCrawlability(signals)
  const blockedBots = AGENT_BOTS.filter((b) => !robots[b])

  const base: DeepScanResult = {
    ok: true,
    url,
    origin,
    elapsedMs,
    score: report.score,
    checks: report.checks,
    agentBots: AGENT_BOTS,
    blockedBots,
    llmAssisted: false,
  }

  // Deterministic fallback path: no entitlement, no LLM, or no readable content.
  if (!opts.llm || !isLlmConfigured() || pageText.length < 40) return base

  const raw = await llmComplete(`Web page content:\n\n${pageText}`, {
    system: SYSTEM,
    maxTokens: 400,
    temperature: 0,
  })
  const parsed = parseComprehension(raw)
  if (!parsed) return base // any LLM failure → exact deterministic report

  // Refine ONLY the content dimension: swap the crude `semantics` check for the
  // LLM comprehension verdict (same id + weight, so scoreFromChecks re-weights it
  // without any weight duplication). Every structural check is untouched.
  const checks = report.checks.map((c) =>
    c.id === 'semantics'
      ? {
          id: 'semantics',
          label: 'Agent comprehension of your offers',
          status: comprehensionStatus(parsed.score),
          detail: `AI comprehension ${parsed.score}/100`,
        }
      : c,
  )

  return {
    ...base,
    checks,
    score: scoreFromChecks(checks),
    llmAssisted: true,
    comprehension: parsed,
  }
}
