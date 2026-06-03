export type AgentDetectionInput = {
  userAgent?: string | null
  referrer?: string | null
  hasIpSignal?: boolean
}

export type AgentDetection = {
  is_ai_agent: boolean
  agent_type: string
  confidence_score: number
  query: string | null
  detection_signals: {
    matched_user_agent?: string
    matched_referrer?: string
    generic_bot?: boolean
    ip_signal_present?: boolean
    reasons: string[]
  }
}

type AgentPattern = {
  type: string
  pattern: RegExp
  confidence: number
  label: string
}

const userAgentPatterns: AgentPattern[] = [
  { type: 'ChatGPT / OpenAI', pattern: /gptbot|chatgpt|oai-searchbot|openai/i, confidence: 96, label: 'OpenAI user-agent match' },
  { type: 'Claude / Anthropic', pattern: /claudebot|claude|anthropic/i, confidence: 96, label: 'Anthropic user-agent match' },
  { type: 'Perplexity', pattern: /perplexity/i, confidence: 94, label: 'Perplexity user-agent match' },
  { type: 'Grok / xAI', pattern: /grok|xai/i, confidence: 92, label: 'xAI/Grok user-agent match' },
  { type: 'Google AI / Crawler', pattern: /google-extended|googleother|googlebot/i, confidence: 78, label: 'Google crawler user-agent match' },
  { type: 'Generic AI Crawler', pattern: /ccbot|bytespider|applebot|amazonbot|youbot|duckassistbot/i, confidence: 72, label: 'Known crawler user-agent match' },
]

const referrerPatterns: AgentPattern[] = [
  { type: 'ChatGPT / OpenAI', pattern: /chatgpt|openai/i, confidence: 88, label: 'OpenAI referrer match' },
  { type: 'Claude / Anthropic', pattern: /claude|anthropic/i, confidence: 88, label: 'Anthropic referrer match' },
  { type: 'Perplexity', pattern: /perplexity/i, confidence: 88, label: 'Perplexity referrer match' },
  { type: 'Grok / xAI', pattern: /grok|x\.ai|xai/i, confidence: 84, label: 'xAI/Grok referrer match' },
]

const genericBotPattern = /bot|crawler|spider|agent|scraper/i

export function detectAgentVisit({ userAgent, referrer, hasIpSignal }: AgentDetectionInput): AgentDetection {
  const reasons: string[] = []
  let agentType = 'Human/Unknown'
  let confidence = 8
  let matchedUserAgent: string | undefined
  let matchedReferrer: string | undefined
  let genericBot = false

  const ua = userAgent || ''
  const ref = referrer || ''

  for (const item of userAgentPatterns) {
    if (item.pattern.test(ua)) {
      agentType = item.type
      confidence = Math.max(confidence, item.confidence)
      matchedUserAgent = item.label
      reasons.push(item.label)
      break
    }
  }

  for (const item of referrerPatterns) {
    if (item.pattern.test(ref)) {
      if (agentType === 'Human/Unknown' || item.confidence > confidence) {
        agentType = item.type
      }
      confidence = Math.max(confidence, item.confidence)
      matchedReferrer = item.label
      reasons.push(item.label)
      break
    }
  }

  if (agentType === 'Human/Unknown' && genericBotPattern.test(ua)) {
    agentType = 'Generic Agent / Bot'
    confidence = 58
    genericBot = true
    reasons.push('Generic bot/crawler/agent user-agent match')
  }

  if (hasIpSignal) {
    reasons.push('Privacy-safe IP signal captured')
    if (agentType !== 'Human/Unknown') {
      confidence = Math.min(100, confidence + 3)
    }
  }

  const isAiAgent = agentType !== 'Human/Unknown'

  return {
    is_ai_agent: isAiAgent,
    agent_type: agentType,
    confidence_score: isAiAgent ? confidence : 12,
    query: extractSearchQueryFromReferrer(referrer),
    detection_signals: {
      matched_user_agent: matchedUserAgent,
      matched_referrer: matchedReferrer,
      generic_bot: genericBot || undefined,
      ip_signal_present: hasIpSignal || undefined,
      reasons,
    },
  }
}

export function extractSearchQueryFromReferrer(referrer?: string | null) {
  if (!referrer) return null

  try {
    const url = new URL(referrer)
    for (const key of ['q', 'query', 'search', 'prompt', 'text']) {
      const value = url.searchParams.get(key)
      if (value?.trim()) return value.trim().slice(0, 500)
    }
  } catch {}

  return null
}

export function isLikelyAgentUserAgent(userAgent: string | null | undefined) {
  return detectAgentVisit({ userAgent }).is_ai_agent
}
