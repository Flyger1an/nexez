# Shopify App Store readiness

Last reviewed against Shopify's public requirements: 2026-07-13.

## Code-backed requirements

- [x] Embedded app home is configured with `embedded = true`.
- [x] Latest App Bridge CDN script is the first script in the embedded document.
- [x] Embedded backend calls use Shopify ID tokens instead of third-party cookies.
- [x] ID tokens verify HS256 signature, audience, expiry, not-before time, issuer,
  destination, Shopify shop domain, user, and session.
- [x] Session-token exchange establishes rotating offline Admin API credentials.
- [x] Existing rotating credentials refresh before expiry, with token rotation
  persisted atomically.
- [x] Reinstalls clear old owner/listing links and require an explicit relink.
- [x] Account linking crosses the iframe boundary with a ten-minute, single-use,
  hashed credential.
- [x] `app/uninstalled` immediately clears credentials and the active listing
  connection, then removes that shop's imported offers. Service-role cleanup
  pointers remain only until Shopify sends `shop/redact`.
- [x] `customers/data_request`, `customers/redact`, and `shop/redact` are declared,
  HMAC verified, and handled. Nexez stores no Shopify customer data.
- [x] Product create/update/delete webhooks queue bounded background reconciliation.
- [x] Catalog reads use the versioned GraphQL Admin API, not the legacy REST Admin API.
- [x] Requested scopes are limited to `read_products,write_app_proxy`.
- [x] Synced Shopify offers retain Shopify storefront URLs as their purchase path.
- [x] One active Shopify store can feed a listing at a time, enforced in both the
  link route and the database.
- [x] Moving or uninstalling a store removes only that store's imported catalog;
  manual offers and another explicitly scoped store are preserved.
- [x] Embedded CSP permits Shopify admin framing without opening the page to arbitrary origins.
- [x] Theme editor deep link is available after linking.
- [x] Privacy and support destinations are visible from the embedded app.
- [x] Account linking uses a user-initiated top-level navigation supported by the
  current Shopify App Bridge Navigation API, with no popup dependency.

## Submission blocker requiring Shopify confirmation

### 1. Distribution classification

Nexez publishes a merchant's Shopify products to an external agent-discovery
network. Shopify describes apps that publish products from Shopify to another
platform as sales channels. Confirm classification with Shopify before review.
If Shopify requires the Sales Channel model, the app will also need the channel
flag, channel-specific scopes, Shopify checkout/order handling, account controls,
and the full Sales Channel review checklist.

### 2. Billing source: resolved as a free connector

- [x] Account linking and first catalog import are not plan gated.
- [x] Embedded manual sync is not plan gated.
- [x] Product-webhook reconciliation is not plan gated.
- [x] Listing-settings sync bypasses the plan gate only for a verified OAuth app
  installation; manually supplied Shopify tokens retain Nexez plan controls.
- [x] Theme discovery links and the storefront proxy are free app functionality.

The embedded Shopify app does not present off-platform pricing or withhold its
Shopify functionality behind a Nexez subscription.

### 3. Checkout boundary

The current importer keeps each Shopify product's storefront URL as its preferred
purchase action. Preserve this invariant. A regular Shopify app must not route a
Shopify-origin purchase around Shopify checkout.

## Partner Dashboard and listing work

Validation evidence from 2026-07-13:

- Shopify CLI `app build` passed the production config and theme-extension checks.
- The Shopify-focused suite passed: 16 test files, 65 tests.
- The live embedded app authenticated, loaded the connected listing, and completed
  a manual sync with 13 active products imported.
- The theme editor showed `Agent-ready discovery` enabled with `/apps/nexez` as
  the storefront proxy path.
- Desktop proofs were captured for the connected app, successful catalog sync,
  and enabled theme app embed under `app-store-media/draft/`. The final icon is
  under `app-store-media/`. Final listing screenshots still require a dedicated
  review catalog and an unlocked storefront endpoint.

- [ ] Confirm regular-app versus Sales Channel classification with Shopify.
- [x] Implement and test the free-connector billing path.
- [ ] Mark the Online Store sales channel as required because the theme app embed
  and app proxy depend on a storefront.
- [ ] Add an emergency developer contact.
- [x] Verify current privacy-policy, terms, and support URLs resolve publicly.
- [ ] Enter the verified legal, support, and data-use URLs in Partner Dashboard.
- [x] Prepare truthful listing copy without rankings, guarantees, or statistics
  in `APP_STORE_LISTING.md`.
- [ ] Capture required desktop and mobile screenshots.
- [x] Prepare the English onboarding screencast script and complete reviewer flow
  in `REVIEWER_GUIDE.md`.
- [ ] Record the onboarding screencast: install, connect account, choose listing,
  sync catalog, enable app embed, inspect agent endpoint.
- [ ] Provide durable review credentials with access to the complete feature set.
- [ ] Run the Partner Dashboard automated quality checks and mandatory-webhook test.
- [ ] Test fresh install, uninstall, reinstall, token refresh, link expiry, webhook
  sync, product deletion, and mobile admin. Manual sync and theme activation are
  verified.
- [ ] Unlock the review store and confirm `/apps/nexez/agent.json` resolves to
  structured data without a storefront-password redirect.

## Release commands

```bash
cd plugins/shopify-nexez
npx @shopify/cli app deploy
```

Release the generated version only after the matching Nexez server deployment is
READY and the Supabase one-active-shop-per-listing migration has been applied.
