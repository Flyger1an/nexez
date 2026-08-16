# Nexez transactional SMS runbook

This is the launch runbook for Nexez SMS. It deliberately enables one narrow
notification first: an opted-in seller receives a generic alert when a *new*
negotiation needs review.

It does **not** enable SMS authorization, SMS approvals, reply-based actions,
magic links, WhatsApp, voice, buyer notifications, or marketing messages.

## Safety boundary

- A destination belongs to a Nexez account, not to a public listing. Never use
  `pages.contact_email`, a buyer-provided contact field, or a listing setting as
  an SMS destination.
- A seller must enter a strict E.164 number, complete Twilio Verify, and
  explicitly consent in account settings before any notification is eligible.
- The only v1 body is:

  ```text
  Nexez: A new negotiation needs review. Sign in to your dashboard: https://app.nexez.ai/dashboard/negotiations Reply STOP to opt out.
  ```

- The dashboard URL is an ordinary sign-in destination. It cannot approve,
  accept, pay, or execute anything.
- The outbox stores no message body, verification code, buyer data, token, or
  raw provider error. It never retries an ambiguous completed send.
- `STOP` opts the account out and suppresses queued work. Twilio Messaging
  Service Advanced Opt-Out is the provider-side backstop for the unavoidable
  final network race after a local opt-out.

## Required production prerequisites

1. A shared Redis/KV rate-limit backend must be configured. SMS verification is
   unavailable without it; in-memory serverless limits are not sufficient.
2. Set a random `NEXEZ_SMS_RATE_LIMIT_SECRET` of at least 32 characters. It
   HMACs phone-rate-limit subjects so an E.164 number never becomes a Redis key.
3. Keep `CRON_SECRET` configured. Vercel invokes the protected SMS worker every
   five minutes; a fresh negotiation also attempts one best-effort dispatch
   after its durable outbox insert.
4. Use a Twilio **restricted API key** for API sends. Keep the Auth Token only
   for validating Twilio webhook signatures; never expose either value to the
   browser or commit it.
5. The privacy and terms pages in this release must be public before the A2P
   campaign is submitted. They include the transactional opt-in, variable
   frequency, message/data-rate, STOP/HELP, consent, and number-sharing terms.

## Vercel environment variables

Set these as server-side production secrets. Do not create `NEXT_PUBLIC_`
variants for any Twilio value.

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio account identity (`AC...`). |
| `TWILIO_API_KEY_SID` | Restricted API key identity (`SK...`). |
| `TWILIO_API_KEY_SECRET` | Restricted API key secret used to send/Verify. |
| `TWILIO_MESSAGING_SERVICE_SID` | Nexez transactional Messaging Service (`MG...`). |
| `TWILIO_VERIFY_SERVICE_SID` | Nexez phone-verification service (`VA...`). |
| `TWILIO_AUTH_TOKEN` | Used exclusively to validate signed Twilio webhooks. |
| `NEXEZ_SMS_RATE_LIMIT_SECRET` | Random 32+ character HMAC secret for phone-keyed Verify limits. |
| `CRON_SECRET` | Existing protected cron authorization secret. |

Do **not** set `TWILIO_WEBHOOK_BASE_URL`, `TWILIO_STATUS_CALLBACK_URL`, or
`TWILIO_INBOUND_WEBHOOK_URL`. Nexez fails closed if any legacy callback override
is present, because callbacks must resolve directly to the canonical runtime
host—not `app.nexez.ai`, `nexez.ai`, `www.nexez.app`, a preview, or a custom
domain.

```text
https://nexez.app/api/webhooks/twilio/inbound
https://nexez.app/api/webhooks/twilio/status
```

Nexez supplies an event-specific `statusCallback` URL for each outbound
message, including its outbox event ID. Do not replace it with an unrelated
static callback; the callback is signed by Twilio and makes delivery-state
correlation durable even if a callback arrives before the send worker records
the provider message ID.

## Twilio Console setup

Do these steps only after the code, migration, policy copy, and shared rate
limit are ready. Creating a number, service, API key, or A2P campaign is a
persistent, potentially billed action.

1. Create a Messaging Service named **Nexez Transactional SMS – Production**.
2. Purchase one SMS-capable US local number and attach it to that Service. A
   local 10-digit long code is subject to US A2P 10DLC registration for
   application-to-person traffic.
3. Configure the Messaging Service inbound request URL to:

   ```text
   https://nexez.app/api/webhooks/twilio/inbound
   ```

   Use `POST` and HTTPS. The Nexez route validates the Twilio signature before
   touching account data and accepts STOP only from the configured Messaging
   Service.
4. Enable **Advanced Opt-Out** for that Messaging Service. Keep STOP and HELP
   responses clear and tied to Nexez transactional seller-negotiation alerts.
   Do not configure START to re-enroll someone; Nexez requires fresh settings
   consent and phone verification.
5. Register the business Brand and a US A2P 10DLC campaign whose declared use
   accurately matches the one generic seller-negotiation alert above. Use the
   narrowest appropriate transactional/account-notification use case available
   in the Console; do not select a mixed or marketing campaign for this scope.
6. Create a Twilio Verify Service for account-phone proof. Keep Fraud Guard
   enabled and configure provider-side Verify Service rate limits as an
   additional guard; they complement, not replace, Nexez's shared app limits.
7. Create a restricted API key for the Nexez server. Do not use the Auth Token
   as the API send credential.
8. Copy only the SIDs/secrets listed above into Vercel's protected environment
   settings. Never paste them into a ticket, issue, browser console, client
   code, or `.env` file that can be committed.

Twilio requires A2P registration for US application-to-person traffic on a
10DLC number and asks for both brand and campaign information, including
opt-in/out/help handling. See Twilio's [A2P 10DLC guide](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) and [Advanced Opt-Out guide](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out).

## Release order

1. Apply `supabase/migrations/20260814232135_add_sms_notifications.sql` to the
   intended Supabase project.
2. Configure the Messaging Service, A2P campaign, Verify service, inbound URL,
   Advanced Opt-Out, shared rate limiter, and Vercel server secrets.
3. Deploy this code. Until every guard is configured, the account SMS UI and
   worker fail closed with an unavailable status.
4. Confirm Vercel sees the `*/5 * * * *` `/api/cron/send-sms` schedule.
5. Run the end-to-end checks below before announcing availability.

## End-to-end acceptance test

Use a Nexez owner account and a controlled mobile number that can receive SMS.
Do not use a buyer's phone number or a public listing contact.

1. Sign in at `app.nexez.ai`, open **Dashboard → Settings**, and enable seller
   negotiation SMS with an E.164 number and explicit consent.
2. Complete the Twilio Verify code. Refresh the screen: it must show only the
   masked last four digits and the enabled state, never the full number.
3. Submit one fresh, non-dry-run negotiation against a listing owned by that
   account. The new outbox event should be de-duplicated, generic, and sent
   only to the verified owner number.
4. Confirm the received message has exactly the approved generic content and
   normal dashboard sign-in link. Confirm Twilio delivery status reaches the
   signed status webhook and the outbox settles correctly.
5. Reply `STOP`. Confirm Twilio's opt-out response, the Nexez account turns
   off the destination, queued work is suppressed, and a second fresh
   negotiation produces no text.
6. Try `START`. It must not re-enroll the account. Re-enrollment requires the
   account settings consent and Verify flow again.
7. Inspect only masked state and aggregate delivery status in application logs
   or admin tooling. Do not copy raw phone numbers, message bodies, or webhook
   payloads into support notes.

## Nexie authorization is intentionally deferred

Nexie SMS authorization is not part of this release. A future implementation
needs a separate buyer-consent topic, server-only atomic approval/outbox
creation, an eligibility recheck for `PENDING` approval state, account
export/deletion handling, and an authenticated live pending-approval resume
screen. Even then, SMS must remain a generic notification—not an approval
token, reply command, magic link, or execution channel.

## Incident response

- To stop future delivery immediately, remove the Twilio Messaging Service
  secret from Vercel or disable the service in Twilio, then redeploy. The worker
  fails closed without full configuration.
- If an account reports an unwanted message, verify that its subscription is
  opted out and its active destination revoked. Keep the account opted out;
  do not reactivate it from an inbound START reply.
- If a webhook signature fails, do not relax validation or IP-allowlist it.
  Confirm the exact HTTPS URL—including the event query parameter for status
  callbacks—matches Twilio's signed request. Twilio signs the full URL and all
  request parameters; Nexez uses Twilio's SDK validator accordingly. See
  Twilio's [webhook security guide](https://www.twilio.com/docs/usage/webhooks/webhooks-security).
