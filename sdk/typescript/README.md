# Nexez Agent SDK

Typed TypeScript client for buyer agents that discover Nexez sellers, read offer manifests, validate actions, and perform approved checkout or negotiation handoffs.

```bash
npm install @nexez/agent-sdk
```

```ts
import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient({ buyerAgent: 'example-agent' })
const matches = await nexez.search('book a strategy session next week', {
  location: 'Chicago, IL',
  limit: 5,
})

const directory = await nexez.browseDirectory({
  category: 'professional',
  minReadiness: 80,
  location: 'Chicago, IL',
})

const first = matches.results[0]
if (!first?.offer) {
  console.log('No actionable Nexez offer found.')
} else {
  const page = await nexez.getAgentPage(first.page.slug)
  const offer = page.offers.find((candidate) => candidate.key === first.offer?.key)

  if (!offer) {
    console.log('The selected offer is no longer available.')
  } else {
    const validation = await nexez.validateCheckout({
      slug: page.page.slug,
      offer: offer.key,
      query: 'Buyer wants a strategy session next week.',
    })
    console.log({ validation })
  }
}
```

Never guess a fallback offer key when search returns no offer. Refresh the page manifest and confirm the selected offer still exists before presenting an action to the buyer.

## Approved actions

Dry runs do not start checkout or submit a proposal. After rendering the exact seller, offer, terms, destination, and data being shared, wait for explicit buyer approval. Forward the validation token and use one stable retry key for that action:

```ts
const checkoutValidation = await nexez.validateCheckout({
  slug: 'acme',
  offer: 'services-0',
  query: 'Book the selected service.',
})

const checkout = await nexez.startCheckout({
  slug: 'acme',
  offer: 'services-0',
  query: 'Book the selected service.',
  approvalToken: checkoutValidation.approvalToken,
  userApproved: true,
}, {
  idempotencyKey: crypto.randomUUID(),
})

const negotiationValidation = await nexez.validateNegotiation({
  slug: 'acme',
  offer: 'services-0',
  budget: 'USD 900',
  timeline: 'next week',
})

const submitted = await nexez.submitNegotiation({
  slug: 'acme',
  offer: 'services-0',
  budget: 'USD 900',
  timeline: 'next week',
  approvalToken: negotiationValidation.approvalToken,
  userApproved: true,
}, {
  idempotencyKey: crypto.randomUUID(),
})

if (submitted.statusToken) {
  const decision = await nexez.waitForNegotiationDecision({
    negotiationId: submitted.negotiationId,
    statusToken: submitted.statusToken,
    timeoutMs: 60_000,
    intervalMs: 1_000,
  })
  console.log({ decision })
}
```

`startCheckout` and `submitNegotiation` reject calls without literal `userApproved: true` and always send `dryRun: false`. Approval tokens bind the validated commercial terms; buyer identity can be added only after consent. Treat negotiation `statusToken` values as bearer credentials: do not log them or expose them in buyer-facing output.

## Agent framework tools

The optional `@nexez/agent-sdk/tools` export provides one canonical nine-tool contract with no framework runtime dependency:

```ts
import { jsonSchema } from 'ai'
import { createNexezClient } from '@nexez/agent-sdk'
import { createOpenAiFunctionTools, createVercelAiSdkTools } from '@nexez/agent-sdk/tools'

const client = createNexezClient({ buyerAgent: 'buyer-agent' })
const vercelTools = createVercelAiSdkTools(jsonSchema, client)
const openAiTools = createOpenAiFunctionTools()
```

`createNexezAgentToolExecutors(client)` is available for other runtimes. Unknown tool inputs are stripped before requests, and the action executors preserve approval and idempotency controls.

## Cancellation and timeouts

Each HTTP request has a 15-second default timeout. Configure a client default or override individual calls, and use an `AbortSignal` for cancellation:

```ts
const controller = new AbortController()
const nexez = createNexezClient({ timeoutMs: 20_000 })

await nexez.search('Chicago photographer', {
  signal: controller.signal,
  timeoutMs: 5_000,
})
```

Negotiation polling is bounded: `waitForNegotiationDecision` defaults to 30 seconds and rejects values above five minutes. It stops as soon as `decisionPending` is false and also accepts `signal`.

## Search location behavior

`location` currently performs text matching against seller locations and offer service areas. Search also supports category, industry, minimum readiness/trust, verification, checkout/negotiation capability, and price-band filters. Each result includes `matched_query_terms` and `match_reasons`. `lat` and `lng` are accepted and echoed as coordinate context, but they do not currently filter or distance-rank results.

## API

The following are available as client methods and standalone exports:

- `searchNexez(query, options)` / `client.search(query, options)`
- `browseDirectory(options)` / `client.browseDirectory(options)`
- `getAgentPage(slug, options)` / `client.getAgentPage(slug, options)`
- `validateCheckout(input, options)` / `client.validateCheckout(input, options)`
- `startCheckout({ ...input, userApproved: true }, options)` / `client.startCheckout(...)`
- `validateNegotiation(input, options)` / `client.validateNegotiation(input, options)`
- `submitNegotiation({ ...input, userApproved: true }, options)` / `client.submitNegotiation(...)`
- `getNegotiationStatus({ negotiationId, statusToken }, options)` / `client.getNegotiationStatus(...)`
- `waitForNegotiationDecision({ negotiationId, statusToken, timeoutMs, intervalMs, signal }, options)` / `client.waitForNegotiationDecision(...)`

`baseUrl` defaults to `https://nexez.app`, supports only HTTP(S), and preserves a configured path prefix for proxy or gateway deployments.

## License

The SDK source in this package is licensed under the MIT License. Use of Nexez hosted APIs and services is governed separately by the [Nexez Terms of Service](https://nexez.ai/terms). The MIT License does not grant rights to Nexez trademarks, logos, hosted services, or service data.
