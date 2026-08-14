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
  /** Vercel's project-use/access verification, not proof that DNS routes correctly. */
  verified: boolean
  /** True only when the domain configuration endpoint returned a valid response. */
  configChecked: boolean
  misconfigured: boolean | null
  configuredBy: 'A' | 'CNAME' | 'dns-01' | 'http' | null
  apexName?: string
  verificationMethod: 'cname' | 'txt' | 'unknown'
  /** Vercel project-access challenges. These are not ordinary routing records. */
  requiredRecords: Array<{ type: string; name?: string; value?: string }>
  recommendedCNAME: string[]
  recommendedIPv4: string[]
  error?: string
}

function emptyStatus(error?: string): VercelDomainStatus {
  return {
    attached: false,
    verified: false,
    configChecked: false,
    misconfigured: null,
    configuredBy: null,
    verificationMethod: 'unknown',
    requiredRecords: [],
    recommendedCNAME: [],
    recommendedIPv4: [],
    ...(error ? { error } : {}),
  }
}

function verificationMethodFor(domain: string, apexName: unknown): VercelDomainStatus['verificationMethod'] {
  if (typeof apexName !== 'string' || !apexName.trim()) return 'unknown'
  const normalizedApex = apexName.trim().toLowerCase().replace(/\.$/, '')
  return normalizedApex === domain.trim().toLowerCase().replace(/\.$/, '') ? 'txt' : 'cname'
}

/** A conservative provider-backed ownership proof for CNAME-routed subdomains. */
export function isCnameProviderProof(status: VercelDomainStatus, cnameConfigured: boolean): boolean {
  return Boolean(
    status.attached &&
      status.verified &&
      status.configChecked &&
      status.misconfigured === false &&
      status.verificationMethod === 'cname' &&
      cnameConfigured &&
      !status.error,
  )
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
  providerConfigChecked?: boolean
  verificationMethod?: VercelDomainStatus['verificationMethod']
  configuredBy?: VercelDomainStatus['configuredBy']
  cnameConfigured?: boolean
  misconfigured?: boolean | null
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
    if (!input.providerConfigChecked) {
      return {
        state: 'error',
        label: 'Status unavailable',
        detail: 'The domain is attached, but its DNS configuration could not be checked. Try again.',
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

    if (input.verificationMethod === 'cname' && !input.cnameConfigured) {
      return {
        state: 'pending_dns',
        label: 'Pending CNAME',
        detail: 'Point this subdomain to Nexez with the requested CNAME record.',
      }
    }
    if (input.verificationMethod !== 'cname' && !input.ownershipVerified) {
      return {
        state: 'verifying',
        label: 'Verify ownership',
        detail: 'Routing is configured. Complete the Nexez TXT ownership check for this apex domain.',
      }
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
    return emptyStatus('not_configured')
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
      return emptyStatus(body?.error?.message || `Vercel add-domain failed (${res.status})`)
    }

    return getDomainStatus(domain)
  } catch (err) {
    return emptyStatus(err instanceof Error ? err.message : 'provider_error')
  }
}

export async function getDomainStatus(domain: string): Promise<VercelDomainStatus> {
  if (!isVercelDomainConfigured()) {
    return emptyStatus('not_configured')
  }

  try {
    const [domainRes, configRes] = await Promise.all([
      fetch(`${VERCEL_API}/v9/projects/${PROJECT_ID}/domains/${domain}${teamQuery()}`, { headers: headers() }),
      fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`, { headers: headers() }),
    ])

    if (!domainRes.ok) {
      // 404 → not attached yet (not an error condition for the wizard).
      return domainRes.status === 404
        ? emptyStatus()
        : emptyStatus(`Vercel domain status failed (${domainRes.status})`)
    }

    const domainData = await domainRes.json().catch(() => ({}))
    const verification = Array.isArray(domainData?.verification) ? domainData.verification : []
    const requiredRecords = verification.map((v: { type?: string; domain?: string; value?: string }) => ({
      type: v.type || 'TXT',
      name: v.domain,
      value: v.value,
    }))

    const apexName = typeof domainData?.apexName === 'string' ? domainData.apexName : undefined
    const verificationMethod = verificationMethodFor(domain, apexName)
    const base = {
      ...emptyStatus(),
      attached: true,
      verified: Boolean(domainData?.verified),
      apexName,
      verificationMethod,
      requiredRecords,
    }

    if (!configRes.ok) {
      return { ...base, error: `Vercel domain configuration failed (${configRes.status})` }
    }

    const configData = await configRes.json().catch(() => null)
    if (!configData || typeof configData.misconfigured !== 'boolean') {
      return { ...base, error: 'Vercel domain configuration returned an invalid response' }
    }

    const recommendedCNAME = Array.isArray(configData.recommendedCNAME)
      ? configData.recommendedCNAME
          .map((item: { value?: unknown }) => (typeof item?.value === 'string' ? item.value : ''))
          .filter(Boolean)
      : []
    const recommendedIPv4 = Array.isArray(configData.recommendedIPv4)
      ? configData.recommendedIPv4.flatMap((item: { value?: unknown }) =>
          Array.isArray(item?.value) ? item.value.filter((value): value is string => typeof value === 'string') : [],
        )
      : []

    const configuredBy = ['A', 'CNAME', 'dns-01', 'http'].includes(configData.configuredBy)
      ? (configData.configuredBy as VercelDomainStatus['configuredBy'])
      : null

    return {
      ...base,
      configChecked: true,
      misconfigured: configData.misconfigured,
      configuredBy,
      recommendedCNAME,
      recommendedIPv4,
    }
  } catch (err) {
    return emptyStatus(err instanceof Error ? err.message : 'provider_error')
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
