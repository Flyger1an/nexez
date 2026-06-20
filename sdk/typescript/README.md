# Nexez Agent SDK

Tiny TypeScript client for buyer agents and agent builders that need to discover Nexez pages, read structured seller context, validate checkout, or submit negotiation intent.

```ts
import { createNexezClient } from '@nexez/agent-sdk'

const nexez = createNexezClient()

const matches = await nexez.search('book a strategy session next week', {
  location: 'Chicago, IL',
  limit: 5,
})

const first = matches.results[0]
const page = await nexez.getAgentPage(first.page.slug)

const validation = await nexez.validateCheckout({
  slug: first.page.slug,
  offer: first.offer?.key ?? 'services-0',
  query: 'Buyer wants a strategy session next week.',
  buyerAgent: 'example-agent',
})
```

## API

- `createNexezClient(options)` - create a client. Defaults to `https://nexez.app`.
- `searchNexez(query, options)` - search published agent pages by buyer intent.
- `getAgentPage(slug, options)` - fetch `/{slug}/agent.json`.
- `validateCheckout(input, options)` - dry-run checkout through `/api/checkout`.
- `validateNegotiation(input, options)` - dry-run proposal validation through `/api/negotiations`.
- `submitNegotiation(input, options)` - submit a buyer proposal after user approval.

## Safety

Use `validateCheckout` or `validateNegotiation` before side-effecting actions. Only call `submitNegotiation` after the buyer has approved the proposal details.
