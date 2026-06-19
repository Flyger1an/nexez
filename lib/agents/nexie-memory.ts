// Structured signals learned from the buyer's chat, merged into user_agents.memory as
// SOFT hints (the explicit Profile preferences stay authoritative). Pure + high-precision:
// budget is only captured when an explicit ceiling cue precedes the amount, so we never
// mis-learn a stray "$5,000 last year" as the buyer's budget. No LLM call (per-turn cost/latency).

export type NexieMemoryTiming = 'flexible' | 'this_week' | 'asap'

export type NexieMemorySignals = {
  /** Major currency units; only set when an explicit ceiling cue precedes a $ amount. */
  budgetObserved: number | null
  timingObserved: NexieMemoryTiming | null
  interest: string | null
}

// Ceiling cues only (drop "over"/"around" — those aren't a max), then a number (+ optional k).
const BUDGET_CUE =
  /(?:budget(?:\s+is|\s+of)?|under|up to|at most|no more than|less than|below|max(?:imum)?)\s*\$?\s?([\d][\d,]*(?:\.\d+)?)\s*(k)?\b/i

const TIMING_RULES: [RegExp, NexieMemoryTiming][] = [
  [/\b(asap|right away|right now|urgent(?:ly)?|today|tonight|immediately)\b/i, 'asap'],
  [/\b(this week|next week|tomorrow|in a few days|within days|by (?:mon|tues|wednes|thurs|fri|satur|sun)day)\b/i, 'this_week'],
  [/\b(flexible|no rush|no hurry|whenever|some\s?day|eventually)\b/i, 'flexible'],
]

const MAX_BUDGET = 100_000_000

export function extractMemorySignals(message: string): NexieMemorySignals {
  const text = (message || '').replace(/\s+/g, ' ').trim().slice(0, 500)

  let budgetObserved: number | null = null
  const bm = text.match(BUDGET_CUE)
  if (bm) {
    let n = Number.parseFloat(bm[1].replace(/,/g, ''))
    if (bm[2]) n *= 1000
    if (Number.isFinite(n) && n > 0 && n <= MAX_BUDGET) budgetObserved = Math.round(n)
  }

  let timingObserved: NexieMemoryTiming | null = null
  for (const [re, t] of TIMING_RULES) {
    if (re.test(text)) {
      timingObserved = t
      break
    }
  }

  const cleaned = text.toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const interest = cleaned ? cleaned.slice(0, 90) : null

  return { budgetObserved, timingObserved, interest }
}

/**
 * Merge new chat signals into the durable memory blob. Soft hints (`budget_observed`,
 * `timing_observed`) are only written when present, so a turn that mentions neither never
 * clobbers an earlier learned value. The explicit Profile preferences remain authoritative.
 */
export function mergeMemorySignals(
  memory: Record<string, unknown>,
  signals: NexieMemorySignals,
  message: string,
  toolsUsed: string[],
  nowIso: string,
): Record<string, unknown> {
  const prior = Array.isArray(memory.interests)
    ? (memory.interests as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const interests = [signals.interest, ...prior].filter((x): x is string => Boolean(x)).slice(0, 8)

  return {
    ...memory,
    last_intent: message.slice(0, 240),
    last_tools: toolsUsed,
    interests,
    ...(signals.budgetObserved != null ? { budget_observed: signals.budgetObserved } : {}),
    ...(signals.timingObserved ? { timing_observed: signals.timingObserved } : {}),
    updated_at: nowIso,
  }
}
