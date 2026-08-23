# Plan entitlements and commerce readiness

This document is the product and enforcement contract for Nexez plans. The executable application matrix lives in `lib/billing.ts`; the private database plan catalog and its pgTAP contract tests mirror it for direct-write enforcement.

## Product boundary

Subscription entitlements buy intelligence, automation, collaboration, capacity, support, and lower settlement fees. They do not decide whether a merchant may participate in commerce.

Discovery, agent-readable artifacts, manual offers, CSV and deterministic website import, provider handoffs, Stripe Connect payout onboarding, Nexez checkout, orders, refunds, reservations, recurring agreements, staged settlement, and current-period finance remain core. Their availability is determined by publication, inventory, payout readiness, program flags, and operational safety—not subscription rank. The public buyer simulator and its public-marketplace competitive matching are a platform-funded discovery exception: they may compose public facts on every plan. Merchant-facing AI refinement, private competitor benchmarking, content optimization, and credential review remain Launch features.

Stripe catalog import/sync is a premium integration and is separate from foundational Stripe payout setup. The installed Shopify OAuth/App Store connector is a second explicit core exception: installation, listing link/relink, initial and manual catalog sync, and webhook-driven catalog refresh remain available on every plan. Manually supplied Shopify Admin credentials stay inside the Pro premium-integration entitlement.

## Allocation

| Capability | Free | Launch | Pro | Scale | Enterprise |
|---|---:|---:|---:|---:|---:|
| Published listings | 1 | 3 | 25 | 100 | Custom/unlimited |
| Storefronts | 1 | 1 | 3 | 10 | Custom/unlimited |
| Active custom domains | 0 | 1 | 5 | 25 | Custom/unlimited |
| Team seats | 0 | 0 | 3 | 10 | Custom/unlimited |
| Installed Shopify App Store connector | Yes | Yes | Yes | Yes | Yes |
| Custom domain | — | Yes | Yes | Yes | Yes |
| AI refinement | — | Yes | Yes | Yes | Yes |
| Custom branding and badge removal | — | Yes | Yes | Yes | Yes |
| Premium catalog/scheduling integrations and sync (manual Shopify credentials included; installed Shopify OAuth excluded) | — | — | Yes | Yes | Yes |
| Outbound webhooks | — | — | Yes | Yes | Yes |
| Private management API | — | — | Yes | Yes | Yes |
| Negotiation and smart pricing | — | — | Yes | Yes | Yes |
| Full analytics history | — | — | Yes | Yes | Yes |
| Team collaboration | — | — | Yes | Yes | Yes |
| Priority support routing | — | — | — | Yes | Yes |
| SSO / SAML | — | — | — | — | Sales-assisted |
| Default settlement commission | 9% | 7% | 5% | 3% | 2% (negotiated 1–2%) |

## Resolution rules

1. A paid subscription confers while active, past due, or unpaid. A trial confers only through a finite, non-null `trial_ends_at`.
2. When multiple live promotions overlap, the highest plan rank wins; latest expiry and stable ID break ties.
3. Paid subscription and promotion are additive; the higher commercial plan wins.
4. Platform-admin status grants Enterprise product entitlements only. It never changes commission economics.
5. Enterprise commission overrides must be active and between 100 and 200 basis points.
6. Missing or unreadable entitlement state fails to Free for paid features and to not-ready for operational commerce.

Support incident severity is separate from the service tier. Every plan may report an urgent incident; Scale and Enterprise tickets receive priority queue routing, while client-supplied plan metadata never affects routing.

## Downgrades

Downgrades preserve seller configuration and business records but suspend execution that is no longer entitled. Excess listings are unpublished deterministically; excess storefronts remain manageable but leave public serving; custom-domain routing is masked or blocked at activation; collaborator access is suspended below Pro; and premium integration workers stop before credentials are decrypted or providers are called. The installed Shopify OAuth connector is not paused by a downgrade and continues its App Store catalog-sync contract. Capacity is restored oldest-first when the account upgrades or frees a slot. Disconnects, cleanup, refunds, status inspection, and in-flight transaction completion remain available.

## Change discipline

Any future allocation change must update the TypeScript matrix, database catalog migration, pricing comparison, mobile snapshot contract if its wire shape changes, and both TypeScript and pgTAP matrix tests in the same pull request.
