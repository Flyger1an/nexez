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
- [x] `app/uninstalled` immediately clears credentials and listing ownership.
- [x] `customers/data_request`, `customers/redact`, and `shop/redact` are declared,
  HMAC verified, and handled. Nexez stores no Shopify customer data.
- [x] Product create/update/delete webhooks queue bounded background reconciliation.
- [x] Catalog reads use the versioned GraphQL Admin API, not the legacy REST Admin API.
- [x] Requested scopes are limited to `read_products,write_app_proxy`.
- [x] Synced Shopify offers retain Shopify storefront URLs as their purchase path.
- [x] Embedded CSP permits Shopify admin framing without opening the page to arbitrary origins.
- [x] Theme editor deep link is available after linking.
- [x] Privacy and support destinations are visible from the embedded app.

## Submission blockers requiring a product decision

### 1. Distribution classification

Nexez publishes a merchant's Shopify products to an external agent-discovery
network. Shopify describes apps that publish products from Shopify to another
platform as sales channels. Confirm classification with Shopify before review.
If Shopify requires the Sales Channel model, the app will also need the channel
flag, channel-specific scopes, Shopify checkout/order handling, account controls,
and the full Sales Channel review checklist.

### 2. Billing source

Catalog sync is currently gated by the seller's Stripe-backed Nexez plan. Shopify
does not permit off-platform billing for paid public-app functionality.

Choose one path before submission:

1. **Shopify-native billing, recommended for App Store distribution.** Add
   Shopify Managed Pricing or Billing API subscriptions and bridge the accepted
   charge into Nexez entitlements. Support upgrades, downgrades, cancellation,
   reinstall, and test charges.
2. **Free Shopify connector.** Remove the Nexez plan gate from all app-provided
   Shopify functionality. Keep paid Nexez features separate from the connector.
3. **Custom distribution.** Keep Stripe billing and do not list the app publicly.

### 3. Checkout boundary

The current importer keeps each Shopify product's storefront URL as its preferred
purchase action. Preserve this invariant. A regular Shopify app must not route a
Shopify-origin purchase around Shopify checkout.

## Partner Dashboard and listing work

- [ ] Confirm regular-app versus Sales Channel classification with Shopify.
- [ ] Implement and test the selected billing path.
- [ ] Mark the Online Store sales channel as required because the theme app embed
  and app proxy depend on a storefront.
- [ ] Add an emergency developer contact.
- [ ] Add current privacy-policy, terms, support, and data-use URLs.
- [ ] Prepare truthful listing copy without rankings, guarantees, or statistics.
- [ ] Capture required desktop and mobile screenshots.
- [ ] Record an English onboarding screencast: install, connect account, choose
  listing, sync catalog, enable app embed, inspect agent endpoint.
- [ ] Provide durable review credentials with access to the complete feature set.
- [ ] Run the Partner Dashboard automated quality checks and mandatory-webhook test.
- [ ] Test fresh install, uninstall, reinstall, token refresh, link expiry, manual
  sync, webhook sync, product deletion, theme activation, and mobile admin.

## Release commands

```bash
cd plugins/shopify-nexez
npx @shopify/cli app deploy
```

Release the generated version only after the matching Nexez server deployment is
READY and the Supabase migration for embedded link sessions has been applied.
