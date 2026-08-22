import type { CompetitorAnalysis } from './competitor-analyzer'
import type { UrlSimComparison } from './url-simulation'

export type AgentLabResearchKind = 'url_snapshot' | 'competitor_benchmark'

export type AgentLabResearchEvidence = {
  execution: {
    boundary: 'server'
    method: 'deterministic' | 'deterministic_with_llm'
    llmExecuted: boolean
  }
  source: {
    fetch: 'respectful_public_web'
    rawHtmlStored: false
    cache: 'not_applicable' | 'fresh' | 'process_hit'
  }
  storage: {
    scope: 'private_owner_workspace'
    immutable: true
    savedByExplicitChoice: boolean
  }
  commerce: {
    transactionsExecuted: 0
    notice: string
  }
}

export type AgentLabResearchRun = {
  id: string
  kind: AgentLabResearchKind
  targetUrl: string
  targetHost: string
  comparedPageId: string | null
  comparedPageSlug: string | null
  result: UrlSimComparison | CompetitorAnalysis
  evidence: AgentLabResearchEvidence
  createdAt: string
}

export type AgentLabResearchRow = {
  id: string
  kind: AgentLabResearchKind
  target_url: string
  target_host: string
  compared_page_id: string | null
  compared_page_slug: string | null
  result: UrlSimComparison | CompetitorAnalysis
  evidence: AgentLabResearchEvidence
  created_at: string
}

export const AGENT_LAB_RESEARCH_SELECT = [
  'id',
  'kind',
  'target_url',
  'target_host',
  'compared_page_id',
  'compared_page_slug',
  'result',
  'evidence',
  'created_at',
].join(', ')

export function researchRowToRun(row: AgentLabResearchRow): AgentLabResearchRun {
  return {
    id: row.id,
    kind: row.kind,
    targetUrl: row.target_url,
    targetHost: row.target_host,
    comparedPageId: row.compared_page_id,
    comparedPageSlug: row.compared_page_slug,
    result: row.result,
    evidence: row.evidence,
    createdAt: row.created_at,
  }
}

export function researchEvidence(
  kind: AgentLabResearchKind,
  opts?: { cacheHit?: boolean; llmExecuted?: boolean },
): AgentLabResearchEvidence {
  const llmExecuted = opts?.llmExecuted === true
  return {
    execution: {
      boundary: 'server',
      method: llmExecuted ? 'deterministic_with_llm' : 'deterministic',
      llmExecuted,
    },
    source: {
      fetch: 'respectful_public_web',
      rawHtmlStored: false,
      cache: kind === 'url_snapshot' ? 'not_applicable' : opts?.cacheHit ? 'process_hit' : 'fresh',
    },
    storage: {
      scope: 'private_owner_workspace',
      immutable: true,
      savedByExplicitChoice: true,
    },
    commerce: {
      transactionsExecuted: 0,
      notice: 'This research run inspected public information only. No checkout, payment, booking, inventory hold, or provider handoff was executed.',
    },
  }
}

export function targetHost(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url.trim().slice(0, 253)
  }
}

export function researchTargetUrl(url: string) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url.trim().slice(0, 2048)
  }
}
