# Nexez Agent-Ready Shopify app

Makes a Shopify store agent-legible via the merchant's [Nexez](https://nexez.ai)
listing. Two parts:

- **Theme app extension** (`extensions/agent-ready/`) ships same-origin manifest
  and agent-summary discovery links, plus an optional verification `<meta>`, in
  the storefront `<head>`.
- **App server routes** (in the main Nexez Next app) provide OAuth installation,
  mandatory webhooks, and an **App Proxy** that serves the full live artifacts
  under the shop's own domain. All are **inert** until `SHOPIFY_API_KEY` /
  `SHOPIFY_API_SECRET` are set (every route 404s / 401s without them).

## Why a theme extension isn't enough on its own

A Shopify theme app extension renders in Liquid and **cannot** fetch `embed.json`
at render time or intercept `/.well-known/*` and issue 301s (Shopify doesn't let
apps take over arbitrary storefront routes). So the extension alone gives agents
the manifest **link**; the full JSON-LD + artifact redirects are delivered by the
**App Proxy** (`/apps/nexez/agent.json`, `/apps/nexez/llms.txt`, and the other
allowlisted child paths on the storefront) once the app is installed and linked.
Shopify signs each request, Nexez resolves the linked listing, and Shopify follows
the response to the live `nexez.app/<slug>/<artifact>` resource.

## Server routes

| Route | Host | Purpose |
| --- | --- | --- |
| `GET /api/shopify/auth` | app.nexez.ai | OAuth install start (SSRF-pinned shop, CSRF state) |
| `GET /api/shopify/callback` | app.nexez.ai | HMAC + state verify -> expiring offline credentials -> `shopify_installs` |
| `POST /api/webhooks/shopify` | app.nexez.ai | `app/uninstalled` + GDPR (HMAC-verified) |
| `GET /api/shopify/proxy` | app.nexez.ai | App-Proxy-signed artifact delivery |

Data: `shopify_installs` (migrations `20260711015728` and `20260712222518`)
maps a shop domain to a Nexez owner/listing plus encrypted, rotating offline
credentials. The table is service-role only. Access tokens are refreshed before
expiry, refresh-token rotation is persisted atomically, and uninstall/GDPR
webhooks revoke the local connection state.

## Catalog sync

After a merchant links the installed shop to a Nexez listing, Nexez immediately
imports the active, published storefront catalog for Pro accounts. The same OAuth
installation powers later manual syncs from listing settings; merchants never
paste an Admin API token into Nexez.

Catalog reads use Shopify's GraphQL Admin API and preserve the store currency,
product and variant IDs, storefront URLs, availability, sellable quantity, and up
to ten variant tiers. Nexez stores the product URL as the preferred transaction
path so buyers and agents complete the purchase on the merchant's Shopify store.

## Release and merchant activation

1. Create the app in your **Shopify Partner** dashboard; copy Client ID/secret and
   set `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in the Nexez environment, plus
   `INTEGRATION_SECRET_KEY` for token encryption.
2. Keep the `read_products,write_app_proxy` scopes, redirect URL, App Proxy, and
   compliance webhook topics in `shopify.app.toml` synchronized with production.
3. Run `shopify app deploy` (the theme extension has its own release lifecycle,
   separate from the Vercel `next build`).
4. Install the app, link the shop to a Nexez listing, confirm the initial catalog
   sync, then use the post-link theme editor button to activate and save the
   Agent-ready discovery app embed.
5. Complete the App Store listing and review (screenshots, privacy policy, and
   the mandatory-webhook check), then a real `*.myshopify.com` install for
   end-to-end verification.

Existing installations created before expiring offline tokens were enabled must
approve OAuth again once. Installations must also approve OAuth whenever requested
scopes change. The addition of `write_app_proxy` therefore requires
reauthorization.

## Billing

Keep **Stripe** as the single entitlement source of truth. A Shopify install maps
to an existing Nexez owner/listing and does **not** mint entitlements. The
merchant still needs a Nexez Pro plan (Stripe) for catalog sync. This avoids a
second, unsynced entitlement source (`getOwnerBillingState` only reads Stripe).
