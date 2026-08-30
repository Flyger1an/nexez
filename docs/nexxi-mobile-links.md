# Nexxi mobile links and checkout returns

Nexez owns the website half of Nexxi's mobile link contract on the agent runtime host, `https://nexez.app`.

## Checkout return contract

Authoritative checkout routes inspect the normalized buyer-agent marker. When it is exactly `Nexxi` (case-insensitive after trimming), Stripe Checkout receives:

- success: `https://nexez.app/nexxi/checkout/return?status=success&session_id={CHECKOUT_SESSION_ID}`
- cancel: `https://nexez.app/nexxi/checkout/return?status=cancelled`

Negotiation funding also carries the existing buyer portal token and `kind=negotiation`, allowing the app to open the exact native deal. Other agents and web buyers retain the existing web success and cancel URLs.

The HTTPS return page attempts the `nexie://checkout-return` fallback and always renders an accessible manual button. Payment fulfillment remains webhook-driven.

## Association endpoints

The agent runtime serves:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Set these deployment environment values and redeploy:

| Environment value | Format |
| --- | --- |
| `NEXXI_APPLE_TEAM_ID` | 10-character Apple Developer Team ID |
| `NEXXI_ANDROID_SHA256_CERT_FINGERPRINTS` | Comma-separated SHA-256 certificate fingerprints in colon-delimited hexadecimal form |

The endpoints return `503` and `Cache-Control: no-store` when their required value is absent or invalid. This fails closed instead of publishing an association to an unintended signing identity.

The native identifiers are fixed in code:

- iOS bundle: `app.nexez.nexie`
- Android package: `app.nexez.nexie`
- associated path: `/nexxi/*`

## Authenticated receipt resolution

`GET /api/agents/nexie/checkout-return?session_id=...` requires a valid Nexxi bearer session. It returns a receipt token only when `checkout_orders.buyer_reference` matches the authenticated user id. An absent, delayed, or foreign order returns the same pending response and does not reveal ownership.

## Release checks

1. Verify both association endpoints on `https://nexez.app` return `200` with `application/json`.
2. Confirm the AASA app id is `<TEAM_ID>.app.nexez.nexie` and matches only `/nexxi/*`.
3. Confirm every production and development signing certificate needed by release builds appears in `assetlinks.json`.
4. Build and install fresh iOS and Android binaries after adding the associated-domain configuration.
5. Exercise success, cancellation, and manual browser dismissal on physical devices.
6. Tap order, negotiation, saved-search, and agent-task notifications from terminated and foreground app states.
