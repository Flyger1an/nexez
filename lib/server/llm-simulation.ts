import 'server-only'

import type { AgentPage } from '../agent-page'
import { buildParsedSchema } from '../agent-simulator'
import { isLlmConfigured, llmComplete } from '../llm'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'
import { getPagePrivateMeta } from './page-private-meta'
import { ownerAllows } from './plan'

export type LlmSimulationOutcome = {
  executed: boolean
  model: string | null
  reason: string | null
  result: {
    agent: string
    naturalLanguage: string
    schema: ReturnType<typeof buildParsedSchema>
    llmEnhanced: true
  } | null
}

/**
 * One server-side LLM gate shared by the standalone API and durable Agent Lab
 * runs. A skipped provider is an explicit outcome, never relabeled as LLM work.
 */
export async function runLlmSimulation(
  page: AgentPage,
  query: string,
  baseUrl: string,
): Promise<LlmSimulationOutcome> {
  if (!isLlmConfigured()) {
    return { executed: false, model: null, reason: 'provider_not_configured', result: null }
  }
  if (page.llm_opt_in !== true) {
    return { executed: false, model: null, reason: 'listing_not_opted_in', result: null }
  }

  if (!hasSupabaseAdminEnv()) {
    return { executed: false, model: null, reason: 'entitlement_unavailable', result: null }
  }
  const privateMeta = await getPagePrivateMeta(page.id)
  const allowed = privateMeta.ownerId
    ? await ownerAllows(createAdminClient(), privateMeta.ownerId, 'aiFeatures')
    : false
  if (!allowed) return { executed: false, model: null, reason: 'plan_not_eligible', result: null }

  const model = process.env.LLM_MODEL || 'platform-llm'
  const schema = buildParsedSchema(page, query, `${model}-Agent`, baseUrl)
  const prompt = `You are an AI agent analyzing this published business listing for the query: "${query}".
Listing: ${page.name} - ${page.description || ''}
Offers: ${JSON.stringify(page.services || page.products || []).slice(0, 500)}
Audience: ${page.audience || 'qualified buyers'}
Location: ${page.location || 'N/A'}

Generate a realistic, helpful, concise response grounded only in the published listing. Include the query interpretation, best matching offer with reasons, the next action, and any clarification needed. Do not claim that checkout, payment, availability, or booking was executed. Keep under 150 words.`
  const naturalLanguage = await llmComplete(prompt, { maxTokens: 200, temperature: 0.6 })

  if (!naturalLanguage) {
    return { executed: false, model, reason: 'empty_provider_response', result: null }
  }

  return {
    executed: true,
    model,
    reason: null,
    result: {
      agent: 'LLM-Enhanced',
      naturalLanguage,
      schema,
      llmEnhanced: true,
    },
  }
}
