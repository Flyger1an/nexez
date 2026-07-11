# Nexez Agent-Ready — Shopify app (scaffold)

Makes a Shopify store agent-legible via the merchant's [Nexez](https://nexez.ai)
listing. Two parts:

- **Theme app extension** (`extensions/agent-ready/`) — ships today. An app-embed
  block that server-renders the Nexez manifest `<link rel="alternate">` (and an
  optional verification `<meta>`) into the storefront `<head>`, so agents that
  read the page discover the merchant's live Nexez agent manifest.
- **App server routes** (in the main Nexez Next app) — OAuth install, mandatory
  webhooks, and an **App Proxy** that serves the full live artifacts under the
  shop's own domain. All **inert** until `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
  are set (every route 404s / 401s without them).

## Why a theme extension isn't enough on its own

A Shopify theme app extension renders in Liquid and **cannot** fetch `embed.json`
at render time or intercept `/.well-known/*` and issue 301s (Shopify doesn't let
apps take over arbitrary storefront routes). So the extension alone gives agents
the manifest **link**; the full JSON-LD + artifact redirects are delivered by the
**App Proxy** (`/apps/nexez/*` on the storefront → `app.nexez.ai/api/shopify/proxy`
→ redirect to the live `nexez.app/<slug>/…` artifact) once the app is installed.

## Server routes (already in the repo, dormant)

| Route | Host | Purpose |
| --- | --- | --- |
| `GET /api/shopify/auth` | app.nexez.ai | OAuth install start (SSRF-pinned shop, CSRF state) |
| `GET /api/shopify/callback` | app.nexez.ai | HMAC + state verify → offline token → `shopify_installs` |
| `POST /api/webhooks/shopify` | nexez.app | `app/uninstalled` + GDPR (HMAC-verified) |
| `GET /api/shopify/proxy` | app.nexez.ai | App-Proxy-signed artifact delivery |

Data: `shopify_installs` (migration `20260710160000`) maps a shop domain → Nexez
owner/listing + the encrypted offline token (service-role only).

## Owner actions required to actually ship (cannot be automated here)

1. Create the app in your **Shopify Partner** dashboard; copy Client ID/secret →
   set `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in the Nexez env (+
   `INTEGRATION_SECRET_KEY` for token encryption).
2. Set `client_id` in `shopify.app.toml`; register the redirect URL, App Proxy,
   and the compliance webhooks (all URLs above).
3. `shopify app deploy` (theme extension has its own release lifecycle, separate
   from the Vercel `next build`).
4. App Store listing + review (screenshots, privacy policy, the mandatory-webhook
   check), then a real `*.myshopify.com` install for end-to-end verification.

## Billing

Keep **Stripe** as the single entitlement source of truth. A Shopify install maps
to an existing Nexez owner/listing and does **not** mint entitlements — the
merchant still needs a Nexez Pro plan (Stripe) for catalog sync. This avoids a
second, unsynced entitlement source (`getOwnerBillingState` only reads Stripe).
