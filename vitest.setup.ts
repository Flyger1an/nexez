import { vi } from 'vitest'

// `server-only` throws when imported outside a React Server Component. Several
// server modules (e.g. lib/server/api-auth.ts) import it as a guard; stub it so
// they can be imported in the node test environment.
vi.mock('server-only', () => ({}))

// Deterministic public env so client/server Supabase constructors don't throw on
// import. Secret gates (SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, …) are left
// UNSET on purpose so route tests can exercise the "not configured" branches and
// opt in per-file via vi.stubEnv.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= 'sb_publishable_test'
process.env.NEXT_PUBLIC_SITE_URL ||= 'https://nexez.test'
