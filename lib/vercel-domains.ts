import 'server-only'
// A2 - Custom domain SSL + provisioning via the hosting provider (Vercel).
// Gated like Stripe: when VERCEL_API_TOKEN + VERCEL_PROJECT_ID are absent the
// platform falls back to "manual" mode (ownership-verified, user points DNS at
// their own host). When configured, we attach the domain to the Vercel project
// so TLS is auto-provisioned and status is authoritative.

const VERCEL_API = 'https://api.vercel.com'

const TOKEN = process.env.VERCEL_API_TOKEN
const PROJECT_ID = process.env.VERCEL_PROJECT_ID
const TEAM_ID = process.env.VERCEL_TEAM_ID

export function isVercelDomainConfigured(): boolean {
  return Boolean(TOKEN && PROJECT_ID)
}

function headers() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
}

function teamQuery(): string {
  return TEAM_ID ? `?teamId=${TEAM_ID}` : ''
}

export type VercelDomainStatus = {
  attached: boolean
  verified: boolean
  misconfigured: boolean
  /** DNS records Vercel wants the user to set (CNAME/A/TXT), if any. */
  requiredRecords: Array<{ type: string; name?: string; value?: string }>
  error?: string
}

export type DomainState =
  | 'unconfigured'
  | 'pending_dns'
  | 'verifying'
  | 'ssl_issuing'
  | 'live'
  | 'error'

export type DomainStateInput = {
  hasDomain: boolean
  ownershipVerified: boolean
  providerConfigured: boolean
  attached?: boolean
  providerVerified?: boolean
  misconfigured?: boolean
  errored?: boolean
}

/**
 * Pure state machine for the connection wizard:
 * Pending DNS → Verifying → SSL Issuing → Live (or Error / Unconfigured).
 * Provider (Vercel) status is authoritative when configured; otherwise we
 * report what ownership verification can honestly tell us (manual mode).
 */
export function deriveDomainState(input: DomainStateInput): {
  state: DomainState
  label: string
  detail: string
} {
  if (!input.hasDomain) {
    return { state: 'unconfigured', label: 'No custom domain', detail: 'Add a domain to begin.' }
  }
  if (input.errored) {
    return { state: 'error', label: 'Error', detail: 'Could not reach the hosting provider. Try again.' }
  }

  if (input.providerConfigured) {
    if (!input.attached) {
      return {
        state: 'pending_dns',
        label: 'Pending DNS',
        detail: 'Attach the domain and point your DNS records at the host.',
      }
    }
    if (input.misconfigured) {
      return {
        state: 'pending_dns',
        label: 'Pending DNS',
        detail: 'Domain attached but DNS records are not pointing correctly yet.',
      }
    }
    if (!input.providerVerified) {
      return { state: 'verifying', label: 'Verifying', detail: 'Confirming domain ownership with the host.' }
    }
    return { state: 'live', label: 'Live', detail: 'Domain attached, verified, and serving over HTTPS.' }
  }

  // Manual mode (no provider token): be honest - we can prove ownership but not TLS.
  if (input.ownershipVerified) {
    return {
      state: 'verifying',
      label: 'Ownership verified',
      detail: 'DNS ownership proven. Point the domain at your host to finish SSL (provider auto-provision not configured).',
    }
  }
  return { state: 'pending_dns', label: 'Pending DNS', detail: 'Add the verification record, then verify ownership.' }
}

export async function addDomainToProject(domain: string): Promise<VercelDomainStatus> {
  if (!isVercelDomainConfigured()) {
    return { attached: false, verified: false, misconfigured: false, requiredRecords: [], error: 'not_configured' }
  }

  try {
    const res = await fetch(`${VERCEL_API}/v10/projects/${PROJECT_ID}/domains${teamQuery()}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: domain }),
    })

    // 409 = already added to this project, which is fine for our purposes.
    if (!res.ok && res.status !== 409) {
      const body = await res.json().catch(() => ({}))
      return {
        attached: false,
        verified: false,
        misconfigured: false,
        requiredRecords: [],
        error: body?.error?.message || `Vercel add-domain failed (${res.status})`,
      }
    }

    return getDomainStatus(domain)
  } catch (err) {
    return {
      attached: false,
      verified: false,
      misconfigured: false,
      requiredRecords: [],
      error: err instanceof Error ? err.message : 'provider_error',
    }
  }
}

export async function getDomainStatus(domain: string): Promise<VercelDomainStatus> {
  if (!isVercelDomainConfigured()) {
    return { attached: false, verified: false, misconfigured: false, requiredRecords: [], error: 'not_configured' }
  }

  try {
    const [domainRes, configRes] = await Promise.all([
      fetch(`${VERCEL_API}/v9/projects/${PROJECT_ID}/domains/${domain}${teamQuery()}`, { headers: headers() }),
      fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`, { headers: headers() }),
    ])

    if (!domainRes.ok) {
      // 404 → not attached yet (not an error condition for the wizard).
      return { attached: false, verified: false, misconfigured: false, requiredRecords: [] }
    }

    const domainData = await domainRes.json().catch(() => ({}))
    const configData = configRes.ok ? await configRes.json().catch(() => ({})) : {}

    const verification = Array.isArray(domainData?.verification) ? domainData.verification : []
    const requiredRecords = verification.map((v: { type?: string; domain?: string; value?: string }) => ({
      type: v.type || 'TXT',
      name: v.domain,
      value: v.value,
    }))

    return {
      attached: true,
      verified: Boolean(domainData?.verified),
      misconfigured: Boolean(configData?.misconfigured),
      requiredRecords,
    }
  } catch (err) {
    return {
      attached: false,
      verified: false,
      misconfigured: false,
      requiredRecords: [],
      error: err instanceof Error ? err.message : 'provider_error',
    }
  }
}

export async function removeDomainFromProject(domain: string): Promise<{ ok: boolean; error?: string }> {
  if (!isVercelDomainConfigured()) return { ok: false, error: 'not_configured' }

  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${PROJECT_ID}/domains/${domain}${teamQuery()}`, {
      method: 'DELETE',
      headers: headers(),
    })
    return { ok: res.ok || res.status === 404 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'provider_error' }
  }
}
