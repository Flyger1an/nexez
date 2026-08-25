# Merchant connector operations

This document is the deployment and support source of truth for the Square,
Google Calendar, WooCommerce, and ServiceM8 connectors.

## Shared architecture

All four connectors are listing-scoped. A signed-in owner starts authorization
from the listing Settings page. Nexez binds the authorization state to the user,
owner, listing, and provider for ten minutes. OAuth and application credentials
are encrypted with `INTEGRATION_SECRET_KEY` before they are written to
`merchant_connector_connections`.

The credential table is server-only:

- Row level security is enabled.
- `anon` and `authenticated` receive no table privileges.
- Only trusted service-role routes can read or mutate encrypted credentials.
- Browser responses contain connection status, capabilities, and sync errors,
  never tokens or consumer secrets.

Every importer follows the same safety contract. Upstream redirects are rejected,
provider errors are reduced to safe platform messages, and new provider syncs add
or update offers without deleting unseen merchant data.

## Required configuration

All deployed environments need a stable `INTEGRATION_SECRET_KEY` plus Supabase
service-role configuration. Rotating the encryption key without migrating stored
credentials makes existing connections unreadable.

| Provider | Environment variables | Registered callback |
| --- | --- | --- |
| Square | `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, optional `SQUARE_ENVIRONMENT=sandbox` | `/api/integrations/square/callback` |
| Google Calendar | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | `/api/integrations/google_calendar/callback` |
| ServiceM8 | `SERVICEM8_APP_ID`, `SERVICEM8_APP_SECRET` | `/api/integrations/servicem8/callback` |
| WooCommerce | No shared provider secret | `/api/integrations/woocommerce/callback` |

Register the absolute production URL for each callback in the provider console.
Register the equivalent preview or local callback only in the matching nonproduction
provider application. Never reuse sandbox credentials in production.

## Provider capability contract

### Square

Authorization requests `ITEMS_READ`, `APPOINTMENTS_READ`,
`APPOINTMENTS_ALL_READ`, and `APPOINTMENTS_BUSINESS_SETTINGS_READ`.

The first sync imports catalog items, reads the business booking profile and
bookable team-member count, verifies listing access to Bookings, and attaches the
merchant's canonical Square booking site to imported offers. Booking customer
details are not persisted in offers or connector metadata. The stored operational
metadata contains only counts, capability status, and the public booking URL.

Disconnect attempts Square remote token revocation before deleting the local
encrypted connection. If revocation fails, local deletion fails closed so the
merchant can retry.

Square access tokens are refreshed by a bounded daily credential-maintenance job
when they enter the final 23 days of their 30-day validity window. This keeps
renewal on a seven-day-or-less cadence even when a merchant is inactive.

### Google Calendar

Authorization requests only
`https://www.googleapis.com/auth/calendar.freebusy`, plus offline access for token
refresh. Nexez calls the Freebusy API for the selected calendar, which defaults to
`primary`, and derives listing availability windows from busy intervals.

Nexez does not request calendar event scope and does not read event names,
attendees, descriptions, or notes. The former `Sample only` behavior existed
because the UI called the availability route without an access token and the route
intentionally fell back to deterministic sample windows. The connector now stores
and refreshes OAuth credentials server-side, and the availability route requires a
live authorized connection. There is no sample fallback.

Disconnect calls Google's token revocation endpoint before removing the local
connection.

### WooCommerce

The merchant enters a public HTTPS store origin. Nexez resolves and checks that
origin before redirecting to WooCommerce's `/wc-auth/v1/authorize` flow with
`scope=read`. WooCommerce posts the generated read-only consumer key and secret to
the callback, where Nexez rechecks the signed listing state, store origin, owner,
and plan before storage.

Sync reads published products, inventory state, the store currency, and an order
count through WooCommerce REST API v3. Product links are accepted only when they
resolve to the connected store origin.
Product names, public descriptions, prices, product URLs, SKU values, and stock
state become editable listing offers. Order bodies and customer data are not
stored as offers. The connector never requests write permission.

Deleting the connection removes the local read key. Merchants can also revoke the
key from WooCommerce administration.

### ServiceM8

Authorization requests `vendor` and `read_jobs`. Sync reads job templates and
active jobs. Active templates become editable offers. Private job descriptions and
customer details are never copied into offers. Connector metadata stores only the
number of readable templates and active jobs.

ServiceM8 access is delivered as an add-on. Disconnect removes the encrypted Nexez
connection, and the merchant should also disable the Nexez add-on inside ServiceM8
to complete provider-side revocation.

## Release order

1. Apply `20260825002059_merchant_connector_connections.sql`.
2. Confirm the service role has CRUD access and browser roles have no access.
3. Set provider credentials and the stable encryption key in each environment.
4. Register exact callback URLs in Square, Google, and ServiceM8.
5. Deploy the application and confirm the daily credential cron is registered.
6. Connect one test listing per provider and inspect connection state, first sync,
   manual resync, token refresh where applicable, and disconnect behavior.
7. Confirm no provider token, WooCommerce secret, event detail, order body, or job
   customer detail appears in browser responses, application logs, or offer data.

## Support checks

When a connection reports `Needs attention`:

1. Confirm the provider application and callback URL match the active environment.
2. Confirm `INTEGRATION_SECRET_KEY` has not changed.
3. Check whether the merchant revoked access or removed a required read scope.
4. Reconnect from listing Settings, then run a manual sync.
5. For ServiceM8 disconnect disputes, verify the add-on state inside ServiceM8.

Do not request raw merchant tokens through support channels. Reauthorization is
the recovery path.
