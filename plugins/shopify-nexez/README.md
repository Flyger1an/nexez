# Nexez Agent-Ready Shopify app

Makes a Shopify store agent-legible via the merchant's [Nexez](https://nexez.ai)
listing. Two parts:

- **Embedded app home** (`/shopify`) runs inside Shopify admin with the latest
  App Bridge, authenticates every backend request with a short-lived Shopify ID
  token, and exposes account linking, catalog status, manual sync, theme setup,
  and the storefront agent endpoint.
- **Theme app extension** (`extensions/agent-ready/`) ships same-origin manifest
  and agent-summary discovery links, plus an optional verification `<meta>`, in
  the storefront `<head>`.
- **Channel config extension** (`extensions/channel-config/`) declares Nexez as
  a sales channel, defines the US English channel specification, and lets
  merchants control which products are published to Nexez.
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
| `GET /shopify` | app.nexez.ai | Embedded, cookie-independent App Bridge home |
| `POST /api/shopify/session` | app.nexez.ai | Verify Shopify ID token, exchange/refresh offline credentials, load shop state |
| `POST /api/shopify/session/sync` | app.nexez.ai | Exact-shop catalog refresh authenticated by the Shopify session |
| `GET /api/shopify/claim` | app.nexez.ai | Consume a one-time token and continue top-level Nexez account linking |
| `GET /api/shopify/auth` | app.nexez.ai | OAuth install start (SSRF-pinned shop, CSRF state) |
| `GET /api/shopify/callback` | app.nexez.ai | HMAC + state verify -> expiring offline credentials -> `shopify_installs` |
| `POST /api/webhooks/shopify` | app.nexez.ai | Lifecycle, GDPR, and product-feed webhooks (HMAC-verified) |
| `GET /api/shopify/proxy` | app.nexez.ai | App-Proxy-signed artifact delivery |

Data: `shopify_installs` (migrations `20260711015728` and `20260712222518`)
maps a shop domain to a Nexez owner/listing plus encrypted, rotating offline
credentials. The table is service-role only. Access tokens are refreshed before
expiry, refresh-token rotation is persisted atomically, and uninstall/GDPR
webhooks revoke the local connection state. Embedded account-link tokens are
random, stored only as SHA-256 digests, expire after ten minutes, and are
atomically cleared on first use.

## Catalog sync

After a merchant links the installed shop to a Nexez listing, Nexez creates a
Shopify channel connection and imports only the active products published to the
Nexez sales channel. Shopify contextual product-feed events keep the connection
current. The same OAuth installation powers later manual reconciliations from
listing settings; merchants never paste an Admin API token into Nexez.

Contextual full-sync and incremental product-feed webhooks enqueue a debounced
catalog reconciliation. Product create, update, and delete webhooks remain a
supplemental safety net. A bounded five-minute worker reconciles up to 250 active
channel products per pass, retries transient failures, and reports attention
state in listing settings. Webhook requests never wait on the Shopify Admin API.
Deleted or unpublished Shopify items are pruned only when Shopify confirms the
fetched catalog is complete, and only from that exact shop. Manual offers and
other connected shops remain untouched.

Catalog reads use Shopify's GraphQL Admin API and preserve the store currency,
product and variant IDs, storefront URLs, availability, sellable quantity, and up
to ten variant tiers. Nexez stores the product URL as the preferred transaction
path so buyers and agents complete the purchase on the merchant's Shopify store.

## Release and merchant activation

1. Create the app in your **Shopify Partner** dashboard; copy Client ID/secret and
   set `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in the Nexez environment, plus
   `INTEGRATION_SECRET_KEY` for token encryption.
2. Keep the embedded App URL, `read_products,read_product_listings,write_app_proxy`
   scopes, redirect URL, App Proxy, compliance topics, and lifecycle webhooks in `shopify.app.toml`
   synchronized with production.
3. Configure Shopify App Pricing plans and the Partner API billing environment
   described below.
4. Run `shopify app deploy`. The theme and channel config extensions have their
   own release lifecycle, separate from the Vercel `next build`.
5. Install the app, link the shop to a Nexez listing, confirm the initial catalog
   sync, then use the post-link theme editor button to activate and save the
   Agent-ready discovery app embed.
6. Resolve every blocking decision in `APP_STORE_READINESS.md`, then complete the
   listing, screencast, test credentials, privacy details, and quality checks.

Existing installations created before expiring offline tokens were enabled must
approve OAuth again once. Installations must also approve OAuth whenever requested
scopes change. The addition of `write_app_proxy` therefore requires
reauthorization.

## App Store billing model

Shopify-installed accounts use Shopify App Pricing for Free, Launch, Pro, and
Scale plans. The app sends merchants to Shopify's hosted plan-selection page,
verifies the active subscription through the Partner API, and mirrors that plan
into Nexez entitlements. Stripe subscription checkout and the Stripe customer
portal are disabled for every account linked to an installed Shopify app.

Required server environment:

- `SHOPIFY_PARTNER_ORG_ID`
- `SHOPIFY_PARTNER_API_ACCESS_TOKEN`
- `SHOPIFY_APP_GID`
- `SHOPIFY_APP_HANDLE` (defaults to `nexez-agent-ready`)
- Optional plan-handle overrides: `SHOPIFY_PLAN_HANDLE_FREE`,
  `SHOPIFY_PLAN_HANDLE_LAUNCH`, `SHOPIFY_PLAN_HANDLE_PRO`, and
  `SHOPIFY_PLAN_HANDLE_SCALE`

The Shopify plans must match Nexez's canonical monthly pricing: Free at $0,
Launch at $19, Pro at $49, and Scale at $149. Enterprise remains sales-assisted
and is not offered as an off-platform charge inside the Shopify app.
