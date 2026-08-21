import {
  getBaseUrl,
  getCheckoutOfferKey,
  getCheckoutOffers,
  type AgentPage,
} from './agent-page'
import { buildAgentOfferConfiguration } from './agent-offer-configuration'
import * as core from './agent-simulator-core'

export * from './agent-simulator-core'

/**
 * The simulator historically owned a lightweight presentation schema that was
 * intentionally separate from agent.json. Keep its ranking/verdict engine
 * stable, but enrich every simulated offer with the exact same public commerce
 * configuration contract agents receive from the live manifest.
 *
 * This avoids a second interpretation of recurring or conditional fulfillment:
 * the simulator can explain merchant rules, buyer inputs, and the correct
 * checkout endpoint, while the real checkout dry-run remains the transaction
 * authority for normalized values, pricing, fulfillment decisions, and approval.
 */
function enrichSimulatorSchema(page: AgentPage, schema: any, baseUrl: string) {
  if (!schema?.page || !Array.isArray(schema.page.offers)) return schema

  const authoritativeOffers = new Map(
    getCheckoutOffers(page).map((offer) => [
      getCheckoutOfferKey(offer.kind, offer.index),
      offer,
    ] as const),
  )
  const runtimeBase = baseUrl.replace(/\/+$/, '')

  return {
    ...schema,
    page: {
      ...schema.page,
      offers: schema.page.offers.map((simulatedOffer: any) => {
        const offer = authoritativeOffers.get(String(simulatedOffer?.key ?? ''))
        if (!offer) return simulatedOffer
        const configuration = buildAgentOfferConfiguration(offer)
        if (!configuration) return simulatedOffer

        const action = simulatedOffer.action && typeof simulatedOffer.action === 'object'
          ? simulatedOffer.action
          : {
              method: 'POST',
              body: {
                slug: page.slug,
                offer: getCheckoutOfferKey(offer.kind, offer.index),
              },
            }

        return {
          ...simulatedOffer,
          configuration,
          action: {
            ...action,
            endpoint: `${runtimeBase}${configuration.checkout.path}`,
            availability: configuration.checkout.status,
            ...(configuration.checkout.idempotency_key_required
              ? {
                  required_headers: {
                    'Idempotency-Key': 'Reuse one caller-generated key for dry-run and approved payment.',
                  },
                }
              : {}),
            ...(configuration.input_schema
              ? {
                  configuration_field: 'offerConfiguration',
                  configuration_schema: configuration.input_schema,
                }
              : {}),
            ...(configuration.checkout.runtime_readiness_check
              ? {
                  dry_run_body: {
                    ...(action.body ?? {
                      slug: page.slug,
                      offer: getCheckoutOfferKey(offer.kind, offer.index),
                    }),
                    dryRun: true,
                  },
                }
              : {}),
          },
        }
      }),
    },
  }
}

export function buildPublicDemoSchema(
  page: AgentPage,
  query: string,
  baseUrl = getBaseUrl(),
) {
  return enrichSimulatorSchema(page, core.buildPublicDemoSchema(page, query, baseUrl), baseUrl)
}

export function buildParsedSchema(
  page: AgentPage,
  query: string,
  agent: string,
  baseUrl = getBaseUrl(),
) {
  return enrichSimulatorSchema(page, core.buildParsedSchema(page, query, agent, baseUrl), baseUrl)
}

export function runMultiAgentSimulation(
  page: AgentPage,
  query: string = core.buildDefaultAgentQuery(page),
  baseUrl = getBaseUrl(),
) {
  const simulation = core.runMultiAgentSimulation(page, query, baseUrl)
  return {
    ...simulation,
    results: simulation.results.map((result) => ({
      ...result,
      schema: enrichSimulatorSchema(page, result.schema, baseUrl),
    })),
  }
}
