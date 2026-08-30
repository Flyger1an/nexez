# Nexxi authentication boundary

Nexxi and Nexez share one Supabase project and one user identifier. Native clients must never mint a parallel identity outside that project.

## Text sign-in

`POST /api/auth/phone/start` accepts an account email, resolves only a server-owned verified phone binding, and returns the same opaque accepted response for known and unknown emails. The phone number never crosses the Nexxi wire.

`POST /api/auth/phone/verify` accepts the opaque challenge and numeric code. Web callers retain the cookie-only response. A caller that supplies `client: "native"` receives access and refresh tokens only after Supabase verifies the bound phone and the returned user ID matches the challenge. The response is `no-store`. Dummy, expired, tampered, and mismatched challenges fail generically.

## Destructive-action freshness

`POST /api/account/delete` still targets only the authenticated session user and still requires explicit intent. It now also verifies Supabase's signed `amr` claim. At least one interactive method must be no more than 10 minutes old. `token_refresh`, anonymous, invite, signup, and email-change entries do not satisfy the gate.

JWT `iat` is deliberately not used. Refreshing a long-lived session changes token issuance time without proving that the person holding the device authenticated again.

The seller dashboard asks for the password immediately before deletion and links non-password accounts through the normal Nexez login surface. Nexxi can confirm with password, configured native providers, or the same email-first SMS challenge. The server remains authoritative even if a client skips its UI.
