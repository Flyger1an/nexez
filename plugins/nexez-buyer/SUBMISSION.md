# Nexez Buyer publication draft

This file contains the copy and reviewer instructions for the initial public release. It is not a claim that either marketplace has approved or published the plugin.

## Public listing

- Name: Nexez Buyer
- Short description: Find, compare, and safely validate agent-ready offers on Nexez.
- Category: Shopping
- Website: https://nexez.ai/agents
- Support: https://nexez.ai/support
- Contact email: support@nexez.ai
- Privacy policy: https://nexez.ai/privacy
- Terms: https://nexez.ai/terms
- MCP server: https://nexez.app/mcp
- Authentication: None
- Transport: Streamable HTTP

### Long description

Nexez Buyer helps people discover public products and services published by Nexez merchants. Search by need, location, category, budget, readiness, trust, verification, checkout readiness, or negotiation support. Inspect structured listing details and compare candidates using current published facts.

When a buyer chooses an exact offer, the plugin can dry-run checkout or negotiation validation to surface the current price, requirements, payment readiness, and seller rules. Version 0.1 never charges, creates an order, reserves inventory, submits negotiation terms, or contacts a seller. Every validation clearly states that nothing was charged or submitted.

## Starter prompts

- Find a highly rated photographer near Austin for under $500.
- Show me negotiable professional services near Chicago.
- Compare agent-ready website design offers for price and delivery time.
- Validate this exact offer before I continue to checkout.
- Check whether my budget and timeline fit this seller's negotiation rules.

## Tool annotations

All five tools are read-only, non-destructive, and open-world because they retrieve public marketplace data or perform a forced dry run against a public Nexez service.

| Tool | Annotation justification |
| --- | --- |
| `nexez_search` | Retrieves public matching listings and offers. It does not create or change marketplace state. |
| `nexez_directory` | Retrieves the public Nexez directory. It does not create or change marketplace state. |
| `nexez_get_page` | Retrieves one public structured listing by slug. It does not create or change marketplace state. |
| `nexez_validate_checkout` | Forces `dryRun: true` server-side. It can return validation and handoff details but cannot charge, order, book, or reserve. |
| `nexez_validate_negotiation` | Forces `dryRun: true` server-side. It can evaluate seller rules but cannot submit terms or contact a seller. |

## Reviewer setup

No account, credentials, MFA, private network, or special configuration is required. Connect the universal MCP server URL and scan the tools. The public fixture data currently includes the listings `PAWRA PET CARES` and `Kismet Pros`.

Run the eight cases in `evals/cases.json`. The first five are positive cases and the final three are negative safety cases.

## Release notes

Initial public submission of Nexez Buyer 0.1.0. The plugin combines three buyer workflows with a public, no-auth MCP server. It searches and reads published Nexez offers and performs checkout or negotiation validation only as forced dry runs. No tool can charge, create an order, reserve inventory, submit terms, or contact a seller.

## Availability decision

Initial ChatGPT availability: United States. Expand only after Nexez support and legal readiness are confirmed for additional countries.

## Publication state

- ChatGPT and Codex: development connection tested, public submission not yet sent.
- Claude: private upload and connector tested, public plugin and connector submissions not yet sent.
