import 'server-only'

/**
 * LLM-backed slice of the AI-optimize helpers, split out from lib/ai-optimize.ts
 * so that the deterministic helpers stay client-bundle-safe. This module reads the
 * server-only LLM key (via lib/llm), so the `import 'server-only'` guard above
 * turns any accidental client import into a build error. Only server code (API
 * routes) may import this.
 */
import type { OfferItem } from './agent-page'
import { rewriteForVoiceSync } from './ai-optimize'
import { isLlmConfigured, llmComplete } from './llm'

/**
 * Voice-agent optimization. Uses the platform LLM when enabled (useLlm + key set),
 * otherwise falls back to the deterministic rewriteForVoiceSync — so it always
 * returns a usable, spoken-friendly description.
 */
export async function rewriteForVoice(offer: OfferItem, businessName: string, useLlm = false): Promise<OfferItem> {
  if (useLlm && isLlmConfigured()) {
    try {
      const prompt = `Rewrite this offer description for voice AI agents (e.g. Siri, Alexa, voice assistants). Make it phonetic, concise, spoken naturally: spell out numbers and symbols, remove parentheticals and fluff, use short sentences, natural pauses. Keep all facts, pricing, actions intact. Business: ${businessName}. Original: "${offer.description || ''}"`
      const voiced = await llmComplete(prompt, { maxTokens: 200, temperature: 0.3 })
      if (voiced) return { ...offer, description: voiced.trim() }
    } catch {
      // fall through to deterministic
    }
  }
  return rewriteForVoiceSync(offer, businessName)
}
