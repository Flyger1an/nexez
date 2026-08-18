# Agentic checkout — pricing and merchant copy

Agentic checkout is a foundational commerce capability on every plan. A merchant's subscription changes operating power, limits, and transaction economics; it does not decide whether a commerce-ready merchant may participate.

The customer-facing feature name is **Agentic Checkout** ("Sell through ChatGPT & Google"). Protocol enrollment and settlement readiness still vary by surface and merchant.

## Pricing page

**Core message**

> **Start free. Nexez earns 9% only when a transaction is completed through Nexez.**

> **Lower platform fees as your agent-commerce volume grows.**

| Plan | Nexez commission |
|---|---:|
| Free | 9% |
| Launch | 7% |
| Pro | 5% |
| Scale | 3% |
| Enterprise | Custom, typically 1–2% |

Every plan supports discovery and agentic checkout when the merchant is commerce-ready. Paid plans add higher limits, automation, collaboration, integrations, control, and lower commission rates.

## Readiness nudge

When checkout is unavailable, ask the merchant to complete the missing operational step rather than upgrade:

> **Connect Stripe payouts** — finish onboarding so agents can complete Nexez-settled purchases and earnings can reach your account.

Other valid readiness states include unpublished listing, offer unavailable, program enrollment pending, or a surface not yet live.

## Fee disclosure

> Nexez's platform commission applies to transactions settled through Nexez. Card and payment-processing fees are separate. External provider handoffs are not charged a Nexez transaction commission unless separately agreed.

Do not imply processor fees are included, and do not describe external-provider revenue as Nexez-settled GMV.

## Guardrails

- Do not promise that a particular ACP/UCP surface is live for every merchant; enrollment is independent per surface.
- Commission defaults come from `lib/billing.ts`; negotiated Enterprise rates come from the owner-aware server resolver.
- `agenticCheckout` remains a compatibility capability at rank 0. Do not introduce a Pro upgrade gate for checkout, discovery, or settlement readiness.
- Sell paid plans on leverage, scale, control, automation, and better economics.
